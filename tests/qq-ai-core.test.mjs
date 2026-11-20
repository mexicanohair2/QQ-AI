import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSearchContext,
  buildSearchOnlyAnswer,
  isSupportedImageDataUrl,
  normalizeSearchUrl,
  parseBingResults,
  parseDuckDuckGoResults,
  parseMediaWikiResults,
  shouldSearchWeb,
} from "../src/lib/qq-ai-core.ts";

test("detects explicit current-information and web-search requests", () => {
  assert.equal(shouldSearchWeb("Найди последние новости о космической миссии"), true);
  assert.equal(shouldSearchWeb("Поищи в интернете официальную инструкцию"), true);
  assert.equal(shouldSearchWeb("Какая сейчас погода в Берлине?"), true);
  assert.equal(shouldSearchWeb("Объясни, что такое фотосинтез"), false);
});

test("unwraps DuckDuckGo redirect URLs and rejects unsafe destinations", () => {
  const target = "https://www.example.org/article?a=1";
  const wrapper = "https://duckduckgo.com/l/?uddg=" + encodeURIComponent(target) + "&rut=abc";
  assert.equal(normalizeSearchUrl(wrapper), target);
  assert.equal(normalizeSearchUrl("http://example.org"), null);
  assert.equal(normalizeSearchUrl("https://localhost/private"), null);
  assert.equal(normalizeSearchUrl("javascript:alert(1)"), null);
});

test("parses, sanitizes and deduplicates real search result cards", () => {
  const html = [
    '<div class="result"><a class="result__a" href="https://example.org/one">Первая &amp; важная страница</a>',
    '<div class="result__snippet">Фрагмент <b>первого</b> результата.</div></div>',
    '<div class="result"><a class="result__a" href="https://example.org/one">Дубликат</a>',
    '<div class="result__snippet">Другой текст.</div></div>',
    '<div class="result"><a class="result__a" href="http://unsafe.example/two">Небезопасный URL</a>',
    '<div class="result__snippet">Не должен попасть в результат.</div></div>',
    '<div class="result"><a class="result__a" href="https://example.net">Пример</a>',
    '<div class="result__snippet">Плейсхолдер исключается.</div></div>',
    '<div class="result"><a class="result__a" href="https://docs.example.com/guide">Документация</a>',
    '<div class="result__snippet">Официальный пример.</div></div>',
  ].join("");
  const results = parseDuckDuckGoResults(html, "2026-11-18T00:00:00.000Z");
  assert.equal(results.length, 3);
  assert.equal(results[0].title, "Первая & важная страница");
  assert.equal(results[0].excerpt, "Фрагмент первого результата.");
  assert.equal(results[1].domain, "example.net");
  assert.equal(results[2].domain, "docs.example.com");
  assert.equal(results[0].retrievedAt, "2026-11-18T00:00:00.000Z");
});

test("parses Wikimedia search results safely and builds canonical HTTPS page links", () => {
  const results = parseMediaWikiResults([
    { pageid: 42, title: "NASA", snippet: 'Агентство <span class="searchmatch">NASA</span> и &nbsp; космос' },
    { pageid: 42, title: "Дубликат", snippet: "Не показывать повторно" },
    { pageid: -1, title: "Небезопасная запись", snippet: "Не должна попасть" },
    { pageid: 51, title: "<script>alert(1)</script> Марс", snippet: "<b>Исследование</b> Марса" },
    { pageid: "bad", title: "Некорректная запись", snippet: "Не должна попасть" },
  ], "2026-11-20T12:00:00.000Z");

  assert.equal(results.length, 2);
  assert.equal(results[0].title, "NASA");
  assert.equal(results[0].url, "https://ru.wikipedia.org/?curid=42");
  assert.equal(results[0].domain, "ru.wikipedia.org");
  assert.equal(results[0].excerpt, "Агентство NASA и космос");
  assert.equal(results[1].title, "alert(1) Марс");
  assert.equal(results[1].excerpt, "Исследование Марса");
  assert.equal(results[0].retrievedAt, "2026-11-20T12:00:00.000Z");
  assert.deepEqual(parseMediaWikiResults({ search: [] }), []);
});

test("search context treats snippets as untrusted evidence and builds source links", () => {
  const sources = parseDuckDuckGoResults(
    '<a class="result__a" href="https://docs.example.com">Документация</a><div class="result__snippet">Короткий фрагмент</div>',
  );
  const context = buildSearchContext(sources);
  assert.match(context, /НЕДОВЕРЕННЫЕ ДАННЫЕ/);
  assert.match(context, /https:\/\/docs\.example\.com/);
  assert.match(buildSearchOnlyAnswer(sources), /\[Документация\]\(<https:\/\/docs\.example\.com\/>\)/);
});

test("accepts only bounded base64 image data URLs", () => {
  assert.equal(isSupportedImageDataUrl("data:image/jpeg;base64,QUJDRA=="), true);
  assert.equal(isSupportedImageDataUrl("https://example.com/image.jpg"), false);
  assert.equal(isSupportedImageDataUrl("data:text/plain;base64,QUJDRA=="), false);
});


test("unwraps Bing tracking redirects and rejects internal tracking URLs", () => {
  const target = "https://www.example.com/articles/qq-ai";
  const encoded = "a1" + btoa(target);
  const redirect = "https://www.bing.com/ck/a?u=" + encodeURIComponent(encoded) + "&ntb=1";
  assert.equal(normalizeSearchUrl(redirect), target);
  assert.equal(normalizeSearchUrl("https://www.bing.com/ck/a?u=not-encoded"), null);
});

test("parses Bing organic results, removes tracking redirects and skips unsafe URLs", () => {
  const destination = "https://docs.example.org/guide";
  const redirect = "https://www.bing.com/ck/a?u=" + encodeURIComponent("a1" + btoa(destination));
  const html = [
    '<ol id="b_results">',
    '<li class="b_algo"><h2><a href="' + redirect + '">Официальная документация</a></h2>',
    '<div class="b_caption"><p>Описание <strong>документации</strong>.</p></div></li>',
    '<li class="b_algo"><h2><a href="http://unsafe.example">Небезопасно</a></h2><p>Не показывать.</p></li>',
    '<li class="b_algo"><h2><a href="https://second.example.net/page">Вторая страница</a></h2><p>Короткий сниппет.</p></li>',
    '</ol>',
  ].join("");
  const results = parseBingResults(html, "2026-11-18T12:00:00.000Z");
  assert.equal(results.length, 2);
  assert.equal(results[0].url, destination);
  assert.equal(results[0].domain, "docs.example.org");
  assert.equal(results[0].excerpt, "Описание документации.");
  assert.equal(results[1].domain, "second.example.net");
});

test("search-only answer escapes untrusted Markdown titles", async () => {
  const { buildSearchOnlyAnswer } = await import("../src/lib/qq-ai-core.ts");
  const answer = buildSearchOnlyAnswer([{
    title: "Заголовок ](https://evil.example) **подмена**",
    url: "https://safe.example/article",
    domain: "safe.example",
    retrievedAt: "2026-11-18T12:00:00.000Z",
    excerpt: "Фрагмент",
  }]);
  assert.ok(answer.includes("\\]"));
  assert.ok(answer.includes("\\*"));
  assert.ok(!answer.includes("](https://evil.example)"));
  assert.ok(answer.includes("](<https://safe.example/article>)"));
});

test("search-only answer renders snippets as text rather than Markdown links", async () => {
  const { buildSearchOnlyAnswer } = await import("../src/lib/qq-ai-core.ts");
  const answer = buildSearchOnlyAnswer([{
    title: "Safe title",
    url: "https://safe.example/article",
    domain: "safe.example",
    retrievedAt: "2026-11-18T12:00:00.000Z",
    excerpt: "Фрагмент [переход](https://evil.example) и **подмена**",
  }]);
  assert.ok(answer.includes("\\[переход\\]\\(https://evil\\.example\\)"));
  assert.ok(answer.includes("\\*\\*подмена\\*\\*"));
  assert.ok(!answer.includes("](https://evil.example)"));
});
