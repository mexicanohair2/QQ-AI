import { readRequestTextLimited, readResponseTextLimited } from "../src/lib/bounded-response.ts";
import {
  buildSearchOnlyAnswer,
  parseBingResults,
  parseDuckDuckGoResults,
  parseMediaWikiResults,
  mergeSearchResults,
} from "../src/lib/qq-ai-core.ts";

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
  const host = request.headers.get("host") || new URL(request.url).host;
  if (origin && host) {
    try {
      const parsed = new URL(origin);
      if (parsed.host !== host || !["https:", "http:"].includes(parsed.protocol)) return json({ error: "Недопустимый источник запроса." }, 403);
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

    const retrievedAt = new Date().toISOString();
    const providerResults = await Promise.all(providers.map(async provider => {
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
          return { name: provider.name, sources: [] };
        }

        try {
          const html = await readResponseTextLimited(response, 2_500_000);
          return { name: provider.name, sources: provider.parse(html, retrievedAt) };
        } catch {
          return { name: provider.name, sources: [] };
        }
      } catch {
        return { name: provider.name, sources: [] };
      } finally {
        clearTimeout(providerTimeout);
      }
    }));

    // Wikimedia provides a separate, keyless fallback when search-engine HTML
    // is blocked or changes its markup. Its response is bounded before JSON parsing.
    const wikipediaController = new AbortController();
    const wikipediaTimeout = setTimeout(() => wikipediaController.abort(), 5_000);
    let wikipediaSources = [];
    try {
      const wikipediaUrl = new URL("https://ru.wikipedia.org/w/api.php");
      wikipediaUrl.searchParams.set("action", "query");
      wikipediaUrl.searchParams.set("list", "search");
      wikipediaUrl.searchParams.set("srsearch", body.query.trim());
      wikipediaUrl.searchParams.set("srlimit", "8");
      wikipediaUrl.searchParams.set("srnamespace", "0");
      wikipediaUrl.searchParams.set("srprop", "snippet");
      wikipediaUrl.searchParams.set("format", "json");
      wikipediaUrl.searchParams.set("formatversion", "2");
      wikipediaUrl.searchParams.set("utf8", "1");

      const wikipediaResponse = await fetch(wikipediaUrl.toString(), {
        headers: {
          "Accept": "application/json",
          "Accept-Language": "ru,en;q=0.8",
          "User-Agent": "QQAI/1.0 (https://github.com/mexicanohair2/QQ-AI)",
        },
        signal: wikipediaController.signal,
      });
      if (wikipediaResponse.ok) {
        const rawWikipedia = await readResponseTextLimited(wikipediaResponse, 500_000);
        const wikipediaData = JSON.parse(rawWikipedia) as { query?: { search?: unknown } };
        wikipediaSources = parseMediaWikiResults(wikipediaData.query?.search, retrievedAt);
      } else {
        try { await wikipediaResponse.body?.cancel(); } catch { /* upstream may already be closed */ }
      }
    } catch {
      wikipediaSources = [];
    } finally {
      clearTimeout(wikipediaTimeout);
    }

    const sources = mergeSearchResults([
      ...providerResults.map(result => result.sources),
      wikipediaSources,
    ], 8);
    const providersUsed = [
      ...providerResults.filter(result => result.sources.length > 0).map(result => result.name),
      ...(wikipediaSources.length > 0 ? ["Wikipedia (RU)"] : []),
    ];

    if (!sources.length) {
      return json({
        error: "Поисковые системы и справочная база не вернули доступных результатов. Попробуй уточнить запрос или повторить позже.",
        code: "SEARCH_PROVIDERS_UNAVAILABLE",
        providersAttempted: providers.length + 1,
      }, 502);
    }

    return json({
      answer: buildSearchOnlyAnswer(sources),
      sources,
      provider: providersUsed.join(" + "),
      providersUsed,
      synthesizedByModel: false,
      retrievedAt,
    });
  } catch {
    return json({ error: "Не удалось выполнить поиск QQ AI." }, 502);
  }
}
