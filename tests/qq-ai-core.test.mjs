import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSearchContext,
  buildSearchOnlyAnswer,
  isSupportedImageDataUrl,
  normalizeSearchUrl,
  parseDuckDuckGoResults,
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

test("search context treats snippets as untrusted evidence and builds source links", () => {
  const sources = parseDuckDuckGoResults(
    '<a class="result__a" href="https://docs.example.com">Документация</a><div class="result__snippet">Короткий фрагмент</div>',
  );
  const context = buildSearchContext(sources);
  assert.match(context, /НЕДОВЕРЕННЫЕ ДАННЫЕ/);
  assert.match(context, /https:\/\/docs\.example\.com/);
  assert.match(buildSearchOnlyAnswer(sources), /\[Документация\]\(https:\/\/docs\.example\.com\/\)/);
});

test("accepts only bounded base64 image data URLs", () => {
  assert.equal(isSupportedImageDataUrl("data:image/jpeg;base64,QUJDRA=="), true);
  assert.equal(isSupportedImageDataUrl("https://example.com/image.jpg"), false);
  assert.equal(isSupportedImageDataUrl("data:text/plain;base64,QUJDRA=="), false);
});
