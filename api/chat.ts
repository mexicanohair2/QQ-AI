import { readRequestTextLimited, readResponseTextLimited } from "../src/lib/bounded-response.ts";
import {
  buildSearchOnlyAnswer,
  parseDuckDuckGoResults,
  parseBingResults,
  mergeSearchResults,
  shouldSearchWeb,
} from "../src/lib/qq-ai-core.ts";
import { answerWithQuantum } from "../src/lib/qq-quantum-server.ts";

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

export async function POST(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Метод не поддерживается." }, 405);
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);
  try {
    let raw: string;
    try { raw = await readRequestTextLimited(request, 520_000); }
    catch { return json({ error: "Запрос слишком большой. Сократи историю диалога." }, 413); }
    let body: RequestBody;
    try { body = JSON.parse(raw) as RequestBody; }
    catch { return json({ error: "Некорректный JSON-запрос." }, 400); }
    if (!validMessages(body.messages)) return json({ error: "Некорректный формат диалога." }, 400);

    const messages = body.messages.filter(message => message.role !== "system").map(message => ({ role: message.role, content: message.content }));
    const lastUser = [...messages].reverse().find(message => message.role === "user")?.content || "";
    const needsSearch = body.webSearch === true || shouldSearchWeb(lastUser);
    let sources: Awaited<ReturnType<typeof runSearch>> = [];
    if (needsSearch) {
      try {
        sources = await runSearch(lastUser, controller.signal);

      } catch {

      }
    }

    const answer = needsSearch
      ? buildSearchOnlyAnswer(sources)
      : await answerWithQuantum(messages);
    const encoder = new TextEncoder();
    const completionId = "chatcmpl-" + Date.now().toString(36);
    const created = Math.floor(Date.now() / 1000);
    const chunks = Array.from(answer);
    const responseBody = new ReadableStream<Uint8Array>({
      start(streamController) {
        for (let offset = 0; offset < chunks.length; offset += 32) {
          const content = chunks.slice(offset, offset + 32).join("");
          const payload = {
            id: completionId,
            object: "chat.completion.chunk",
            created,
            model: "qq-quantum-online",
            choices: [{ index: 0, delta: { content }, finish_reason: null }],
          };
          streamController.enqueue(encoder.encode("data: " + JSON.stringify(payload) + "\n\n"));
        }
        const finalChunk = {
          id: completionId,
          object: "chat.completion.chunk",
          created,
          model: "qq-quantum-online",
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        };
        streamController.enqueue(encoder.encode("data: " + JSON.stringify(finalChunk) + "\n\n"));
        streamController.enqueue(encoder.encode("data: [DONE]\n\n"));
        streamController.close();
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
    return json({ error: timedOut ? "Превышено время ожидания поиска или генерации QQ Quantum." : "Не удалось выполнить запрос к собственной модели QQ Quantum." }, timedOut ? 504 : 502);
  } finally {
    clearTimeout(timeout);
  }
}
