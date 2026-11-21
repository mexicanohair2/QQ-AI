import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import {
  findQuantumKnowledgeAnswer,
  indexQuantumKnowledge,
  normalizeQuantumWord,
  buildQuantumPrompt,
} from "../src/lib/qq-quantum-dialogue.ts";

const root = new URL("../", import.meta.url);

test("website does not register a browser-side QQ Quantum model downloader", async () => {
  const config = await readFile(new URL("vite.config.ts", root), "utf8");
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  assert.doesNotMatch(config, /qqQuantumIntegration/);
  assert.doesNotMatch(app, /<button[^>]*>Офлайн<\/button>/);
  assert.doesNotMatch(app, /onClick=\{loadOfflineModel\}/);
  assert.doesNotMatch(app, /Открыть офлайн-режим/);
  assert.match(app, /QQ Quantum работает на сервере/);
});

test("server-side model package matches its manifest and has intact weights", async () => {
  const assets = JSON.parse(await readFile(new URL("server/quantum/model.json", root), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("server/quantum/manifest.json", root), "utf8"));
  assert.equal(manifest.format, "qq-quantum-web-manifest-v1");
  assert.equal(manifest.asset_path, "model.json");
  assert.equal(assets.metadata.format, "qq-quantum-web-weights-v1");
  assert.equal(assets.metadata.checkpoint_format, "qq-quantum-sft-v1");
  assert.equal(assets.metadata.weights_sha256, manifest.weights_sha256);
  const weights = gunzipSync(Buffer.from(assets.weights_gzip_base64, "base64"));
  assert.equal(weights.length, assets.metadata.weight_bytes);
  assert.equal(createHash("sha256").update(weights).digest("hex"), manifest.weights_sha256);
  assert.ok(assets.corpus.length > 100_000);
  await assert.rejects(stat(new URL("public/quantum/model.json", root)));
});

test("knowledge retrieval excludes follow-up-only dialogue documents", () => {
  const corpus = [
    "Пользователь: Как устроена солнечная система?\nQQ Quantum: Солнечная система состоит из Солнца и связанных его гравитацией небесных тел.",
    "Диалог 1. Продолжение контекста.\nПользователь: А что находится в её центре?\nQQ Quantum: В центре находится Солнце.",
  ].join("\n\n");
  const entries = indexQuantumKnowledge(corpus);
  assert.equal(entries.length, 1);
  assert.equal(
    findQuantumKnowledgeAnswer("Расскажи о солнечной системе кратко", entries),
    "Солнечная система состоит из Солнца и связанных его гравитацией небесных тел.",
  );
  assert.equal(findQuantumKnowledgeAnswer("А что находится в её центре?", entries), null);
});

test("Russian noun cases normalise and ambiguous definitions are refused", () => {
  assert.equal(normalizeQuantumWord("систему"), normalizeQuantumWord("система"));
  assert.equal(normalizeQuantumWord("системе"), normalizeQuantumWord("система"));
  const entries = indexQuantumKnowledge([
    "Пользователь: Что означает ключ в шифровании?\nQQ Quantum: В шифровании ключ задаёт параметры преобразования данных.",
    "Пользователь: Что означает ключ в музыке?\nQQ Quantum: Музыкальный ключ задаёт высоту нот на нотном стане.",
  ].join("\n\n"));
  assert.equal(findQuantumKnowledgeAnswer("Что такое ключ?", entries), null);
});

test("dialogue prompt uses real newlines and fits the model context window", () => {
  const encode = (text, bos = false) => [...(bos ? [1] : []), ...text.trim().split(/\s+/).filter(Boolean)];
  const prompt = buildQuantumPrompt([
    { role: "user", content: "Старый вопрос, который уже не нужен." },
    { role: "assistant", content: "Старый ответ." },
    { role: "user", content: "Объясни, как работает солнечная система и почему планеты движутся вокруг звезды." },
  ], encode, 30);
  assert.ok(encode(prompt, true).length <= 30);
  assert.ok(prompt.includes("\nПользователь:"));
  assert.ok(prompt.endsWith("\nQQ Quantum:"));
});
