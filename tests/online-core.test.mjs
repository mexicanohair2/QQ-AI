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
  assert.match(source, /raw\.length > 520_000/);
});

test("web search is a separate real endpoint and is treated as untrusted evidence", async () => {
  const chat = await readFile(new URL("../api/chat.ts", import.meta.url), "utf8");
  const search = await readFile(new URL("../api/search.ts", import.meta.url), "utf8");
  assert.match(chat, /shouldSearchWeb/);
  assert.match(chat, /buildSearchContext/);
  assert.match(search, /html\.duckduckgo\.com/);
  assert.match(search, /synthesizedByModel: false/);
  assert.match(search, /raw\.length > 2_000/);
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

test("online UI does not silently switch to offline Qwen", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /if \(mode === "online"\) \{/);
  assert.match(app, /if \(!shouldSearchWeb\(content\)\) throw onlineError/);
  assert.match(app, /sendOffline\(next\)/);
  assert.match(app, /onlineModelReady/);
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
  assert.match(source, /clearTimeout\(timeout\);[\s\S]*?streamController\.close\(\)/);
  assert.match(source, /async cancel\(reason\)/);
  assert.match(source, /if \(!streamingResponse\) clearTimeout\(timeout\)/);
});
