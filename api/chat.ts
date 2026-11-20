import { readRequestTextLimited, readResponseTextLimited } from "../src/lib/bounded-response.ts";
import {
  buildChatCompletionPayload,
  modelEndpointRequiresApiKey,
  resolveModelApiKey,
  safeModelEndpoint,
} from "../src/lib/model-gateway.ts";
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
    {
      url: "https://html.duckduckgo.com/html/?q=" + encodedQuery,
      parse: parseDuckDuckGoResults,
    },
    {
      url: "https://www.bing.com/search?q=" + encodedQuery + "&count=10&setlang=ru&cc=NL",
      parse: parseBingResults,
    },
  ];
  const retrievedAt = new Date().toISOString();

  const groups = await Promise.all(providers.map(async provider => {
    const providerController = new AbortController();
    const abortFromParent = () => providerController.abort();
    if (signal.aborted) providerController.abort();
    else signal.addEventListener("abort", abortFromParent, { once: true });
    const timeout = setTimeout(() => providerController.abort(), 4_500);

    try {
      const response = await fetch(provider.url, {
        headers: {
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
          "User-Agent": "Mozilla/5.0 (compatible; QQAI/1.0; +https://github.com/mexicanohair2/QQ-AI)",
        },
        signal: providerController.signal,
      });
      if (!response.ok) {
        try { await response.body?.cancel(); } catch { /* upstream may already be closed */ }
        return [];
      }

      try {
        const html = await readResponseTextLimited(response, 2_500_000);
        return provider.parse(html, retrievedAt);
      } catch {
        return [];
      }
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abortFromParent);
    }
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
  const safeEndpoint = safeModelEndpoint(endpoint);
  const apiKey = resolveModelApiKey(process.env.QQ_AI_API_KEY, process.env.OPENAIAPIKEY);

  if (!safeEndpoint || !model || (modelEndpointRequiresApiKey(safeEndpoint) && !apiKey)) {
    return json({
      error: "Онлайн-модель QQ AI не настроена. Проверь адрес API, название модели и серверный ключ провайдера.",
      code: "ONLINE_MODEL_UNCONFIGURED",
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
      body: JSON.stringify(buildChatCompletionPayload({
        endpoint: safeEndpoint,
        model,
        messages,
        temperature: 0.7,
        maxOutputTokens: 2400,
        stream: true,
      })),
    });

    if (!upstream.ok) {
      // Provider error bodies are untrusted, potentially unbounded, and may contain
      // internal diagnostics. Do not relay them to the browser.
      try { await upstream.body?.cancel(); } catch { /* upstream may already be closed */ }
      return json({
        error: "Собственная онлайн-модель QQ AI временно недоступна (ошибка шлюза провайдера).",
        code: "MODEL_UPSTREAM_ERROR",
      }, 502);
    }

    if (!upstream.body) return json({ error: "Онлайн-модель не вернула поток ответа." }, 502);
    const upstreamReader = upstream.body.getReader();
    streamingResponse = true;
    const responseBody = new ReadableStream<Uint8Array>({
      async pull(streamController) {
        try {
          const { done, value } = await upstreamReader.read();
          if (done) {
            streamController.close();
            clearTimeout(timeout);
            streamingResponse = false;
          } else {
            streamController.enqueue(value);
          }
        } catch (streamError) {
          clearTimeout(timeout);
          streamingResponse = false;
          streamController.error(streamError);
        }
      },
      async cancel(reason) {
        clearTimeout(timeout);
        streamingResponse = false;
        try { await upstreamReader.cancel(reason); } catch { /* upstream may already be closed */ }
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
    return json({
      error: timedOut ? "Превышено время ожидания онлайн-модели или поиска." : "Не удалось выполнить онлайн-запрос QQ AI.",
    }, timedOut ? 504 : 502);
  } finally {
    if (!streamingResponse) clearTimeout(timeout);
  }
}
