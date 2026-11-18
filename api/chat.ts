import {
  buildSearchContext,
  parseDuckDuckGoResults,
  shouldSearchWeb,
} from "../src/lib/qq-ai-core";

export const config = { runtime: "edge" };

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
type RequestBody = { messages?: ChatMessage[]; webSearch?: boolean };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  },
});

function safeModelEndpoint(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return null;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function validMessages(value: unknown): value is ChatMessage[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 40) return false;
  return value.every((item) =>
    item && typeof item === "object" &&
    ["system", "user", "assistant"].includes((item as ChatMessage).role) &&
    typeof (item as ChatMessage).content === "string" &&
    (item as ChatMessage).content.length <= 12_000
  );
}

async function runSearch(query: string, signal: AbortSignal) {
  const response = await fetch(
    "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query.slice(0, 300)),
    {
      headers: {
        "Accept": "text/html",
        "User-Agent": "Mozilla/5.0 (compatible; QQAI/1.0; +https://github.com/mexicanohair2/QQ-AI)",
      },
      signal,
    },
  );
  if (!response.ok) throw new Error("Поиск временно недоступен.");
  const html = await response.text();
  if (html.length > 2_500_000) throw new Error("Поисковая выдача слишком большая.");
  return parseDuckDuckGoResults(html);
}

function rejectCrossOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return null;
  try {
    const parsed = new URL(origin);
    if (parsed.host !== host || !["https:", "http:"].includes(parsed.protocol)) {
      return json({ error: "Недопустимый источник запроса." }, 403);
    }
    return null;
  } catch {
    return json({ error: "Некорректный источник запроса." }, 403);
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Метод не поддерживается." }, 405);

  const originError = rejectCrossOrigin(request);
  if (originError) return originError;

  const endpoint = process.env.QQ_AI_API_URL?.trim();
  const model = process.env.QQ_AI_MODEL?.trim();
  const apiKey = process.env.QQ_AI_API_KEY?.trim();
  const safeEndpoint = endpoint ? safeModelEndpoint(endpoint) : null;

  if (!endpoint || !model || !safeEndpoint) {
    return json({
      error: "Онлайн-модель QQ AI ещё не размещена. Серверный шлюз готов, но собственные веса модели пока не запущены на вычислительном сервере. Офлайн-Qwen работает отдельно.",
      code: "ONLINE_MODEL_UNCONFIGURED",
    }, 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);

  try {
    const raw = await request.text();
    if (raw.length > 520_000) return json({ error: "Запрос слишком большой. Сократи историю диалога." }, 413);
    let body: RequestBody;
    try { body = JSON.parse(raw) as RequestBody; }
    catch { return json({ error: "Некорректный JSON-запрос." }, 400); }

    if (!validMessages(body.messages)) return json({ error: "Некорректный формат диалога." }, 400);
    const messages = body.messages.map(message => ({ role: message.role, content: message.content }));
    const lastUser = [...messages].reverse().find(message => message.role === "user")?.content || "";
    const needsSearch = body.webSearch === true || shouldSearchWeb(lastUser);
    let sources = [];

    if (needsSearch) {
      try {
        sources = await runSearch(lastUser, controller.signal);
        messages.unshift({
          role: "system",
          content: sources.length
            ? buildSearchContext(sources)
            : "Для вопроса требовался веб-поиск, но доступных проверяемых результатов не найдено. Не утверждай, что поиск дал подтверждение; предупреди об ограничении.",
        });
      } catch {
        messages.unshift({
          role: "system",
          content: "Веб-поиск для этого запроса временно не сработал. Не придумывай найденные страницы и честно предупреди, что не смог проверить актуальные данные.",
        });
      }
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = "Bearer " + apiKey;

    const upstream = await fetch(safeEndpoint, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 2400,
        stream: true,
      }),
    });

    if (!upstream.ok) {
      const detail = (await upstream.text().catch(() => ""))
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 260);
      return json({
        error: "Собственная онлайн-модель QQ AI ответила с ошибкой " + upstream.status + (detail ? ". " + detail : ""),
        code: "MODEL_UPSTREAM_ERROR",
      }, 502);
    }

    if (!upstream.body) return json({ error: "Онлайн-модель не вернула поток ответа." }, 502);
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        "X-QQ-AI-Search-Used": sources.length ? "true" : "false",
        "X-QQ-AI-Search-Count": String(sources.length),
      },
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return json({
      error: timedOut ? "Превышено время ожидания онлайн-модели или поиска." : "Не удалось выполнить онлайн-запрос QQ AI.",
    }, timedOut ? 504 : 502);
  } finally {
    clearTimeout(timeout);
  }
}
