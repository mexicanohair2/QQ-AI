import { readRequestTextLimited, readResponseTextLimited } from "../src/lib/bounded-response";
import {
  buildSearchOnlyAnswer,
  parseBingResults,
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

  try {
    let raw: string;
    try { raw = await readRequestTextLimited(request, 2_000); }
    catch { return json({ error: "Поисковый запрос слишком длинный." }, 413); }
    let body: { query?: unknown };
    try { body = JSON.parse(raw) as { query?: unknown }; }
    catch { return json({ error: "Некорректный JSON-запрос." }, 400); }

    if (typeof body.query !== "string" || !body.query.trim() || body.query.length > 300) {
      return json({ error: "Введи поисковый запрос длиной до 300 символов." }, 400);
    }

    const encodedQuery = encodeURIComponent(body.query.trim());
    const providers = [
      {
        name: "DuckDuckGo",
        url: "https://html.duckduckgo.com/html/?q=" + encodedQuery,
        parse: parseDuckDuckGoResults,
      },
      {
        name: "Bing",
        url: "https://www.bing.com/search?q=" + encodedQuery + "&count=10&setlang=ru&cc=NL",
        parse: parseBingResults,
      },
    ];

    const providerFailures: string[] = [];
    for (const provider of providers) {
      const providerController = new AbortController();
      const providerTimeout = setTimeout(() => providerController.abort(), 5_000);
      try {
        const response = await fetch(provider.url, {
          headers: {
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          },
          signal: providerController.signal,
        });
        if (!response.ok) {
          try { await response.body?.cancel(); } catch { /* upstream may already be closed */ }
          providerFailures.push(provider.name + ":" + response.status);
          continue;
        }

        let html: string;
        try {
          html = await readResponseTextLimited(response, 2_500_000);
        } catch {
          providerFailures.push(provider.name + ":body-too-large");
          continue;
        }

        const sources = provider.parse(html);
        if (!sources.length) {
          providerFailures.push(provider.name + ":no-organic-results");
          continue;
        }

        return json({
          answer: buildSearchOnlyAnswer(sources),
          sources,
          provider: provider.name + " HTML search results",
          synthesizedByModel: false,
          retrievedAt: new Date().toISOString(),
        });
      } catch {
        providerFailures.push(provider.name + ":network-or-timeout");
      } finally {
        clearTimeout(providerTimeout);
      }
    }

    return json({
      error: "Поисковые системы не вернули доступную выдачу. Попробуй повторить запрос позже.",
      code: "SEARCH_PROVIDERS_UNAVAILABLE",
      providersAttempted: providers.length,
    }, 502);
  } catch {
    return json({ error: "Не удалось выполнить поиск QQ AI." }, 502);
  }
}
