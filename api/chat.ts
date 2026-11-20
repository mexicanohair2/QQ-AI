import { readRequestTextLimited, readResponseTextLimited } from "../src/lib/bounded-response.ts";
import { safeModelEndpoint } from "../src/lib/model-gateway.ts";
import {
  buildSearchContext,
  parseDuckDuckGoResults,
  parseBingResults,
  mergeSearchResults,
  shouldSearchWeb,
} from "../src/lib/qq-ai-core.ts";

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
  const encodedQuery = encodeURIComponent(query.slice(0, 300));
  const providers = [
    { url: "https://html.duckduckgo.com/html/?q=" + encodedQuery, parse: parseDuckDuckGoResults },
    { url: "https://www.bing.com/search?q=" + encodedQuery + "&count=10&setlang=ru&cc=NL", parse: parseBingResults },
  ];
  const retrievedAt = new Date().toISOString();
  const groups = await Promise.all(providers.map(async provider => {
    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", abortFromParent, { once: true });
    const timeout = setTimeout(() => controller.abort(), 4_500);
    try {
      const response = await fetch(provider.url, {
        headers: {
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
          "User-Agent": "Mozilla/5.0 (compatible; QQAI/1.0; +https://github.com/mexicanohair2/QQ-AI)",
        },
        signal: controller.signal,
      });
      if (!response.ok) { try { await response.body?.cancel(); } catch { /* closed */ } return []; }
      try { return provider.parse(await readResponseTextLimited(response, 2_500_000), retrievedAt); }
      catch { return []; }
    } catch { return []; }
    finally { clearTimeout(timeout); signal.removeEventListener("abort", abortFromParent); }
  }));
  return mergeSearchResults(groups, 8);
}

function rejectCrossOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host") || new URL(request.url).host;
  if (!origin || !host) return null;
  try {
    const parsed = new URL(origin);
    if (parsed.host !== host || !["https:", "http:"].includes(parsed.protocol)) {
      return json({ error: "Недопустимый источник запроса." }, 403);
    }
    return null;
  } catch { return json({ error: "Некорректный источник запроса." }, 403); }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Метод не поддерживается." }, 405);
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;

  // Only a separately hosted QQ Quantum inference service may power Online text.
  // No OpenAI, DeepSeek, Qwen or generic provider fallback is permitted here.
  const endpoint = safeModelEndpoint(process.env.QQ_QUANTUM_ONLINE_URL?.trim());
  const token = process.env.QQ_QUANTUM_ONLINE_TOKEN?.trim();
  if (!endpoint || !token) {
    return json({
      error: "Собственная модель QQ Quantum Online ещё не подключена. Поиск работает отдельно; генерация через сторонние языковые модели отключена.",
      code: "QQ_QUANTUM_ONLINE_UNAVAILABLE",
    }, 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);
  let streamingResponse = false;
  try {
    let raw: string;
    try { raw = await readRequestTextLimited(request, 520_000); }
    catch { return json({ error: "Запрос слишком большой. Сократи историю диалога." }, 413); }
    let body: RequestBody;
    try { body = JSON.parse(raw) as RequestBody; }
    catch { return json({ error: "Некорректный JSON-запрос." }, 400); }
    if (!validMessages(body.messages)) return json({ error: "Некорректный формат диалога." }, 400);

    const messages = body.messages.map(message => ({ role: message.role, content: message.content }));
    const lastUser = [...messages].reverse().find(message => message.role === "user")?.content || "";
    const needsSearch = body.webSearch === true || shouldSearchWeb(lastUser);
    let sources: Awaited<ReturnType<typeof runSearch>> = [];
    if (needsSearch) {
      try {
        sources = await runSearch(lastUser, controller.signal);
        messages.unshift({
          role: "system",
          content: sources.length
            ? buildSearchContext(sources)
            : "Для запроса требовался веб-поиск, но проверяемые результаты не найдены. Не придумывай страницы и предупреди об ограничении.",
        });
      } catch {
        messages.unshift({
          role: "system",
          content: "Веб-поиск временно не сработал. Не выдумывай найденные страницы и предупреди, что не смог проверить актуальные данные.",
        });
      }
    }

    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      signal: controller.signal,
      body: JSON.stringify({
        model: "qq-quantum-online",
        messages,
        temperature: 0.65,
        max_tokens: 1200,
        stream: true,
        search_context_attached: sources.length > 0,
      }),
    });
    if (!upstream.ok) {
      try { await upstream.body?.cancel(); } catch { /* upstream may already be closed */ }
      return json({
        error: "Собственная онлайн-модель QQ Quantum временно недоступна.",
        code: "MODEL_UPSTREAM_ERROR",
      }, 502);
    }
    if (!upstream.body) return json({ error: "QQ Quantum Online не вернула поток ответа." }, 502);

    const reader = upstream.body.getReader();
    streamingResponse = true;
    const responseBody = new ReadableStream<Uint8Array>({
      async pull(streamController) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            streamController.close();
            clearTimeout(timeout);
            streamingResponse = false;
          } else streamController.enqueue(value);
        } catch (error) {
          clearTimeout(timeout);
          streamingResponse = false;
          streamController.error(error);
        }
      },
      async cancel(reason) {
        clearTimeout(timeout);
        streamingResponse = false;
        try { await reader.cancel(reason); } catch { /* upstream may be closed */ }
      },
    });
    return new Response(responseBody, {
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
    return json({ error: timedOut ? "Превышено время ожидания QQ Quantum Online или поиска." : "Не удалось выполнить запрос к QQ Quantum Online." }, timedOut ? 504 : 502);
  } finally {
    if (!streamingResponse) clearTimeout(timeout);
  }
}
