import {
  buildSearchOnlyAnswer,
  parseDuckDuckGoResults,
} from "../src/lib/qq-ai-core";

export const config = { runtime: "edge" };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  },
});

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Метод не поддерживается." }, 405);

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return json({ error: "Недопустимый источник запроса." }, 403);
    } catch {
      return json({ error: "Некорректный источник запроса." }, 403);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const raw = await request.text();
    if (raw.length > 2_000) return json({ error: "Поисковый запрос слишком длинный." }, 413);
    let body: { query?: unknown };
    try { body = JSON.parse(raw) as { query?: unknown }; }
    catch { return json({ error: "Некорректный JSON-запрос." }, 400); }

    if (typeof body.query !== "string" || !body.query.trim() || body.query.length > 300) {
      return json({ error: "Введи поисковый запрос длиной до 300 символов." }, 400);
    }

    const response = await fetch(
      "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(body.query.trim()),
      {
        headers: {
          "Accept": "text/html",
          "User-Agent": "Mozilla/5.0 (compatible; QQAI/1.0; +https://github.com/mexicanohair2/QQ-AI)",
        },
        signal: controller.signal,
      },
    );
    if (!response.ok) return json({ error: "Поисковая система временно недоступна." }, 502);
    const html = await response.text();
    if (html.length > 2_500_000) return json({ error: "Поисковая выдача слишком большая." }, 502);

    const sources = parseDuckDuckGoResults(html);
    return json({
      answer: buildSearchOnlyAnswer(sources),
      sources,
      provider: "DuckDuckGo search results",
      synthesizedByModel: false,
      retrievedAt: new Date().toISOString(),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return json({
      error: timedOut ? "Поиск превысил допустимое время ожидания." : "Не удалось выполнить поиск QQ AI.",
    }, timedOut ? 504 : 502);
  } finally {
    clearTimeout(timeout);
  }
}
