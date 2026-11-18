import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("online route is a project-owned model gateway, not a Cerebras proxy", async () => {
  const source = await readFile(new URL("../api/chat.ts", import.meta.url), "utf8");
  assert.match(source, /QQ_AI_API_URL/);
  assert.match(source, /QQ_AI_MODEL/);
  assert.match(source, /ONLINE_MODEL_UNCONFIGURED/);
  assert.match(source, /safeModelEndpoint/);
  assert.doesNotMatch(source, /CEREBRAS_API_KEY/);
  assert.match(source, /readRequestTextLimited\(request, 520_000\)/);
});

test("web search is a separate real endpoint and is treated as untrusted evidence", async () => {
  const chat = await readFile(new URL("../api/chat.ts", import.meta.url), "utf8");
  const search = await readFile(new URL("../api/search.ts", import.meta.url), "utf8");
  assert.match(chat, /shouldSearchWeb/);
  assert.match(chat, /buildSearchContext/);
  assert.match(search, /html\.duckduckgo\.com/);
  assert.match(search, /synthesizedByModel: false/);
  assert.match(search, /readRequestTextLimited\(request, 2_000\)/);
  assert.match(search, /Недопустимый источник запроса/);
});

test("capabilities distinguish actual online, search, vision, video and offline states", async () => {
  const source = await readFile(new URL("../api/capabilities.ts", import.meta.url), "utf8");
  for (const key of ["onlineText", "webSearch", "imageUnderstanding", "videoUnderstanding", "offlineText"]) assert.ok(source.includes(key));
  assert.match(source, /state: hasVision \? "configured" : "unconfigured"/);
});

test("vision gateway validates request size, image MIME, timestamps and retention", async () => {
  const source = await readFile(new URL("../api/vision.ts", import.meta.url), "utf8");
  assert.match(source, /QQ_AI_VISION_API_URL/);
  assert.match(source, /video_frames/);
  assert.match(source, /timestampMs/);
  assert.match(source, /4_300_000/);
  assert.match(source, /3 \* 1024 \* 1024/);
  assert.match(source, /mediaRetained: false/);
  assert.match(source, /audioAnalyzed: false/);
});

test("browser media pipeline compresses images and uploads only sampled video frames", async () => {
  const media = await readFile(new URL("../src/lib/media.ts", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(media, /export async function prepareImage/);
  assert.match(media, /export async function sampleVideoFrames/);
  assert.match(media, /Math\.min\(8/);
  assert.match(media, /duration > 60/);
  assert.match(app, /sampleVideoFrames/);
  assert.match(app, /fetch\("\/api\/vision"/);
  assert.match(app, /исходный ролик/);
});

test("offline-first chat can answer locally and enrich current questions with real search sources", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /useState<Mode>\("offline"\)/);
  assert.match(app, /async function sendOffline\(history: Message\[\]\)/);
  assert.match(app, /if \(shouldSearchWeb\(lastUserMessage\)\)/);
  assert.match(app, /fetch\("\/api\/search"/);
  assert.match(app, /buildSearchContext\(sources\)/);
  assert.match(app, /Не выдавай сведения за актуальные/);
  assert.match(app, /sendOffline\(next\)/);
  assert.match(app, /if \(mode === "online"\) \{/);
});

test("chat gateway rejects cross-origin browser requests", async () => {
  const source = await readFile(new URL("../api/chat.ts", import.meta.url), "utf8");
  assert.match(source, /function rejectCrossOrigin/);
  assert.match(source, /const originError = rejectCrossOrigin\(request\)/);
  assert.match(source, /Недопустимый источник запроса/);
});

test("QQCross Game AI uses the same QQ-owned online model gateway", async () => {
  const source = await readFile(new URL("../api/game-assistant.ts", import.meta.url), "utf8");
  assert.match(source, /QQ_AI_API_URL/);
  assert.match(source, /QQ_AI_MODEL/);
  assert.doesNotMatch(source, /CEREBRAS_API_KEY|api\.cerebras\.ai/);
  assert.match(source, /authenticate\(request\)/);
});


test("manual QQ Search works independently of the online generation model", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const start = app.indexOf("async function searchWeb()");
  const end = app.indexOf("async function sendOnline(", start);
  assert.ok(start >= 0 && end > start, "manual search handler should exist");
  const handler = app.slice(start, end);
  assert.match(handler, /sendSearchFallback\(content\)/);
  assert.doesNotMatch(handler, /sendOnline|sendOffline/);
  assert.match(handler, /setStatus\("Поиск завершён"\)/);
  assert.match(app, /aria-label="Поиск в интернете"/);
  assert.match(app, /disabled=\{!draft\.trim\(\) \|\| attachments\.length > 0 \|\| busy\}/);
});


test("OpenAI stream reader handles split CRLF events and a final event without a blank-line terminator", async () => {
  const { readOpenAIChatStream } = await import("../src/lib/openai-stream.ts");
  const encoder = new TextEncoder();
  const crlf = String.fromCharCode(13, 10);
  const first = 'data: {"choices":[{"delta":{"content":"Прив"}}]}' + String.fromCharCode(13);
  const second = String.fromCharCode(10, 13, 10) + 'data: {"choices":[{"delta":{"content":"ет"}}]}';
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(first));
      controller.enqueue(encoder.encode(second));
      controller.close();
    },
  });
  const received = [];
  const answer = await readOpenAIChatStream(body, token => received.push(token));
  assert.equal(answer, "Привет");
  assert.deepEqual(received, ["Прив", "ет"]);
});

test("OpenAI stream reader accepts a non-streaming compatible JSON response", async () => {
  const { readOpenAIChatStream } = await import("../src/lib/openai-stream.ts");
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(JSON.stringify({
        choices: [{ message: { content: "Обычный JSON-ответ" } }],
      })));
      controller.close();
    },
  });
  assert.equal(await readOpenAIChatStream(body, () => {}), "Обычный JSON-ответ");
});

test("OpenAI stream reader rejects empty and oversized responses", async () => {
  const { readOpenAIChatStream } = await import("../src/lib/openai-stream.ts");
  const empty = new ReadableStream({ start(controller) { controller.close(); } });
  await assert.rejects(() => readOpenAIChatStream(empty, () => {}), /пустой ответ/);
  const payload = "x".repeat(120_001);
  const oversized = new ReadableStream({
    start(controller) {
      const frame = "data: " + JSON.stringify({ choices: [{ delta: { content: payload } }] }) + String.fromCharCode(10, 10);
      controller.enqueue(new TextEncoder().encode(frame));
      controller.close();
    },
  });
  await assert.rejects(() => readOpenAIChatStream(oversized, () => {}), /допустимый размер/);
});


test("chat gateway keeps its upstream timeout active for the lifetime of the response stream", async () => {
  const source = await readFile(new URL("../api/chat.ts", import.meta.url), "utf8");
  assert.match(source, /let streamingResponse = false/);
  assert.match(source, /const responseBody = new ReadableStream/);
  assert.match(source, /streamController\.close\(\);[\s\S]*?clearTimeout\(timeout\)/);
  assert.match(source, /async cancel\(reason\)/);
  assert.match(source, /if \(!streamingResponse\) clearTimeout\(timeout\)/);
});


test("welcome screen offers an explicit path to the offline model when online inference is unconfigured", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /Онлайн-модель пока не подключена/);
  assert.match(app, /Открыть локальный режим/);
  assert.match(app, /Перейти в офлайн-режим/);
});


test("capability-check failure remains unknown instead of falsely claiming no model is configured", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /setOnlineModelReady\(null\); setVisionReady\(null\); setCapabilitiesUnavailable\(true\)/);
  assert.match(app, /Не удалось проверить статус моделей/);
});


test("bounded response reader enforces the byte limit from headers and streamed chunks", async () => {
  const { readResponseTextLimited } = await import("../src/lib/bounded-response.ts");
  const declaredTooLarge = new Response("too large", { headers: { "content-length": "100" } });
  await assert.rejects(() => readResponseTextLimited(declaredTooLarge, 20), /превышает допустимый размер/);

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("123456"));
      controller.enqueue(new TextEncoder().encode("789012"));
      controller.close();
    },
  });
  await assert.rejects(() => readResponseTextLimited(new Response(stream), 10), /превышает допустимый размер/);
});

test("bounded response reader preserves UTF-8 characters split between chunks", async () => {
  const { readResponseTextLimited } = await import("../src/lib/bounded-response.ts");
  const bytes = new TextEncoder().encode("Привет");
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.slice(0, 3));
      controller.enqueue(bytes.slice(3));
      controller.close();
    },
  });
  assert.equal(await readResponseTextLimited(new Response(stream), 32), "Привет");
});

test("search endpoints consume bounded response bodies instead of unbounded response.text", async () => {
  const chat = await readFile(new URL("../api/chat.ts", import.meta.url), "utf8");
  const search = await readFile(new URL("../api/search.ts", import.meta.url), "utf8");
  assert.match(chat, /readResponseTextLimited\(response, 2_500_000\)/);
  assert.match(search, /readResponseTextLimited\(response, 2_500_000\)/);
  assert.doesNotMatch(chat, /const html = await response\.text\(\)/);
  assert.doesNotMatch(search, /const html = await response\.text\(\)/);
});


test("incoming API request bodies are capped while reading, not after full buffering", async () => {
  const { readRequestTextLimited } = await import("../src/lib/bounded-response.ts");
  const declaredTooLarge = new Request("https://qq-ai.test/api/search", {
    method: "POST",
    headers: { "content-length": "100" },
    body: "x",
  });
  await assert.rejects(() => readRequestTextLimited(declaredTooLarge, 10), /превышает допустимый размер/);

  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("123456"));
      controller.enqueue(new TextEncoder().encode("789012"));
      controller.close();
    },
  });
  const streamedRequest = new Request("https://qq-ai.test/api/chat", { method: "POST", body, duplex: "half" });
  await assert.rejects(() => readRequestTextLimited(streamedRequest, 10), /превышает допустимый размер/);
});

test("chat, search and vision routes no longer buffer request.text before enforcing limits", async () => {
  for (const path of ["../api/chat.ts", "../api/search.ts", "../api/vision.ts"]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /readRequestTextLimited\(request,/);
    assert.doesNotMatch(source, /await request\.text\(\)/);
  }
});


test("chat gateway never relays unbounded or provider-internal error bodies to the browser", async () => {
  const source = await readFile(new URL("../api/chat.ts", import.meta.url), "utf8");
  const errorBranch = source.slice(source.indexOf("if (!upstream.ok)"), source.indexOf("if (!upstream.body)"));
  assert.match(errorBranch, /upstream\.body\?\.cancel\(\)/);
  assert.match(errorBranch, /MODEL_UPSTREAM_ERROR/);
  assert.doesNotMatch(errorBranch, /upstream\.text\(\)|readResponseTextLimited/);
  assert.doesNotMatch(errorBranch, /detail|Authorization|apiKey|token/i);
});


test("manual search endpoint uses a provider fallback and returns only parsed organic sources", async () => {
  const search = await readFile(new URL("../api/search.ts", import.meta.url), "utf8");
  assert.match(search, /html\.duckduckgo\.com\/html/);
  assert.match(search, /www\.bing\.com\/search/);
  assert.match(search, /parseBingResults/);
  assert.match(search, /SEARCH_PROVIDERS_UNAVAILABLE/);
  assert.match(search, /synthesizedByModel: false/);
});

test("vision gateway bounds upstream JSON and never relays provider error diagnostics", async () => {
  const source = await readFile(new URL("../api/vision.ts", import.meta.url), "utf8");
  assert.match(source, /readResponseTextLimited\(upstream, 256_000\)/);
  assert.match(source, /upstream\.body\?\.cancel\(\)/);
  assert.match(source, /answer\.length > 20_000/);
  assert.doesNotMatch(source, /await upstream\.json\(\)|await upstream\.text\(\)/);
  const errorBranch = source.slice(source.indexOf("if (!upstream.ok)"), source.indexOf("let rawResult: string"));
  assert.doesNotMatch(errorBranch, /upstream\.status|apiKey|Authorization|token/i);
});

test("chat and standalone search cancel failed upstream response bodies", async () => {
  const chat = await readFile(new URL("../api/chat.ts", import.meta.url), "utf8");
  const search = await readFile(new URL("../api/search.ts", import.meta.url), "utf8");
  assert.match(chat, /if \(!response\.ok\) \{[\s\S]*?response\.body\?\.cancel\(\)/);
  assert.match(search, /if \(!response\.ok\) \{[\s\S]*?response\.body\?\.cancel\(\)/);
});

test("chat history storage filters malformed records and bounds restored messages", async () => {
  const { sanitizeChatMessages } = await import("../src/lib/chat-storage.ts");
  const input = [
    { role: "system", content: "not a visible chat role" },
    { role: "user", content: 42 },
    { role: "assistant", content: "x".repeat(120_001) },
    { role: "user", content: "valid", attachments: [{ name: "photo.jpg", kind: "image" }, { name: "../bad", kind: "other" }] },
    ...Array.from({ length: 45 }, (_, index) => ({ role: "assistant", content: "message-" + index })),
  ];
  const messages = sanitizeChatMessages(input);
  assert.equal(messages.length, 40);
  assert.equal(messages[0].content, "message-5");
  assert.equal(messages.at(-1).content, "message-44");
  const single = sanitizeChatMessages([input[3]]);
  assert.deepEqual(single[0].attachments, [{ name: "photo.jpg", kind: "image" }]);
});

test("image and video attachment controls stay disabled until a vision model is configured", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /if \(visionReady !== true\)/);
  assert.match(app, /disabled=\{busy \|\| mode !== "online" \|\| visionReady !== true\}/);
  assert.match(app, /async function sendVision[\s\S]*?if \(visionReady !== true\)/);
});


test("offline model branding is hidden from the interface and voice input uses a vector icon", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const internalModelId = 'const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";';
  assert.ok(app.includes(internalModelId));
  assert.doesNotMatch(app.replace(internalModelId, ""), /Qwen/i);
  assert.match(app, /function VoiceIcon\(\)/);
  assert.doesNotMatch(app, /🎙/);
  assert.match(app, /gpu\.requestAdapter\(\)/);
  assert.match(app, /if \(!adapter\)/);
});


test("offline-first welcome screen offers one clear action to prepare the local AI", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /Загрузить и запустить ИИ/);
  assert.match(app, /Локальная модель ещё не загружена/);
  assert.match(app, /для актуальных тем искать источники в интернете/);
});

test("offline chat does not append a user message before the local model is ready", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /mode === "offline" && !offlineReady\)[\s\S]*?Сначала нажми «Загрузить и запустить ИИ»[\s\S]*?return;/);
});

test("public capability response does not expose third-party model branding", async () => {
  const capabilities = await readFile(new URL("../api/capabilities.ts", import.meta.url), "utf8");
  assert.doesNotMatch(capabilities, /Qwen/i);
  assert.match(capabilities, /offlineText: \{ state: "available" \}/);
});


test("assistant answers can be read aloud locally and speech playback can be stopped", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(app, /function speakMessage\(content: string, index: number\)/);
  assert.match(app, /new SpeechSynthesisUtterance/);
  assert.match(app, /utterance\.lang = "ru-RU"/);
  assert.match(app, /function stopSpeech\(\)/);
  assert.match(app, /window\.speechSynthesis\.cancel\(\)/);
  assert.match(app, /Озвучить ответ/);
  assert.match(styles, /\.feedback \.speak-button/);
});

test("online mode falls back to the local model when cloud inference is unconfigured or unavailable", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /mode === "online" && onlineModelReady === false/);
  assert.match(app, /if \(offlineReady\)[\s\S]*?setMode\("offline"\)[\s\S]*?await sendOffline\(next\)/);
  assert.match(app, /Онлайн-модель недоступна\. Переключаюсь на локальную/);
  assert.match(app, /Облачная модель QQ AI ещё не подключена/);
});


test("merges independent search results fairly and removes duplicate or unsafe URLs", async () => {
  const { mergeSearchResults } = await import("../src/lib/qq-ai-core.ts");
  const source = (title, url, domain) => ({
    title, url, domain, retrievedAt: "2026-11-18T12:00:00.000Z", excerpt: title + " snippet",
  });
  const merged = mergeSearchResults([
    [
      source("DDG first", "https://one.example/page#top", "one.example"),
      source("DDG second", "https://two.example/page", "two.example"),
    ],
    [
      source("Bing duplicate", "https://one.example/page", "wrong.example"),
      source("Bing second", "https://three.example/page", "three.example"),
    ],
  ], 8);
  assert.deepEqual(merged.map(item => item.title), ["DDG first", "Bing second", "DDG second"]);
  assert.equal(merged[0].domain, "one.example");
  assert.equal(merged.length, 3);
  assert.equal(mergeSearchResults([[source("Unsafe", "http://unsafe.example", "unsafe.example")]]).length, 0);
});

test("search route calls both providers in parallel and returns deduplicated results", async () => {
  const { default: searchHandler } = await import("../api/search.ts");
  const originalFetch = globalThis.fetch;
  const calls = [];
  const duckDuckGoHtml = `
    <a class="result__a" href="https://one.example/article">DuckDuckGo result</a>
    <a class="result__snippet">A useful source snippet.</a>
  `;
  const bingHtml = `
    <li class="b_algo"><h2><a href="https://one.example/article#top">Duplicate result</a></h2><div class="b_caption"><p>Duplicate snippet.</p></div></li>
    <li class="b_algo"><h2><a href="https://two.example/article">Bing result</a></h2><div class="b_caption"><p>Another source snippet.</p></div></li>
  `;

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url.hostname);
    if (url.hostname === "html.duckduckgo.com") return new Response(duckDuckGoHtml, { status: 200 });
    if (url.hostname === "www.bing.com") return new Response(bingHtml, { status: 200 });
    throw new Error("Unexpected provider host: " + url.hostname);
  };

  try {
    const request = new Request("https://qq-ai.test/api/search", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://qq-ai.test" },
      body: JSON.stringify({ query: "QQ AI test" }),
    });
    const response = await searchHandler(request);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(calls.sort(), ["html.duckduckgo.com", "www.bing.com"]);
    assert.deepEqual(body.providersUsed, ["DuckDuckGo", "Bing"]);
    assert.deepEqual(body.sources.map(item => item.title), ["DuckDuckGo result", "Bing result"]);
    assert.equal(body.sources[0].domain, "one.example");
    assert.equal(body.sources.length, 2);
    assert.equal(body.synthesizedByModel, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("search route still succeeds when one provider is unavailable", async () => {
  const { default: searchHandler } = await import("../api/search.ts");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "html.duckduckgo.com") return new Response("blocked", { status: 503 });
    return new Response(
      `<li class="b_algo"><h2><a href="https://available.example/article">Available result</a></h2><div class="b_caption"><p>Available snippet.</p></div></li>`,
      { status: 200 },
    );
  };

  try {
    const request = new Request("https://qq-ai.test/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "provider fallback" }),
    });
    const response = await searchHandler(request);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.providersUsed, ["Bing"]);
    assert.equal(body.sources[0].url, "https://available.example/article");
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("search route rejects a cross-origin request without contacting providers", async () => {
  const { default: searchHandler } = await import("../api/search.ts");
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => { fetchCalled = true; throw new Error("should not be called"); };
  try {
    const request = new Request("https://qq-ai.test/api/search", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.example" },
      body: JSON.stringify({ query: "blocked" }),
    });
    const response = await searchHandler(request);
    assert.equal(response.status, 403);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("chat route rejects a cross-origin request even when Host is absent", async () => {
  const { default: chatHandler } = await import("../api/chat.ts");
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => { fetchCalled = true; throw new Error("should not be called"); };
  try {
    const request = new Request("https://qq-ai.test/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.example" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
    });
    const response = await chatHandler(request);
    assert.equal(response.status, 403);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});