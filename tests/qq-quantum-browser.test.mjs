import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { qqQuantumIntegration } from "../scripts/qq-quantum-vite-plugin.mjs";
import {
  findQuantumKnowledgeAnswer,
  indexQuantumKnowledge,
  normalizeQuantumWord,
  buildQuantumPrompt,
} from "../src/lib/qq-quantum-dialogue.ts";

const root = new URL("../", import.meta.url);

test("Vite integration produces a local QQ Quantum mode without changing the source App", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  const transformed = qqQuantumIntegration().transform(app, "/project/src/App.tsx").code;
  assert.match(transformed, /QQ_Quantum_Offline\.html/);
  assert.match(transformed, /workers\/qq-quantum\.worker\.ts/);
  assert.match(transformed, /importQuantumModelHtml/);
  assert.match(transformed, /QQ Quantum/);
  assert.doesNotMatch(transformed, /DeepSeek|Qwen2/);
  assert.doesNotMatch(transformed, /engine\.current/);
});

test("Vite integration leaves non-App modules untouched", () => {
  const plugin = qqQuantumIntegration();
  assert.equal(plugin.transform("export default 1", "/project/src/main.ts"), null);
});

test("browser knowledge retrieval excludes follow-up-only dialogue documents", () => {
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

test("browser retrieval normalises common Russian noun cases and refuses ambiguous definitions", () => {
  assert.equal(normalizeQuantumWord("систему"), normalizeQuantumWord("система"));
  assert.equal(normalizeQuantumWord("системе"), normalizeQuantumWord("система"));
  const entries = indexQuantumKnowledge([
    "Пользователь: Что означает ключ в шифровании?\nQQ Quantum: В шифровании ключ задаёт параметры преобразования данных.",
    "Пользователь: Что означает ключ в музыке?\nQQ Quantum: Музыкальный ключ задаёт высоту нот на нотном стане.",
  ].join("\n\n"));
  assert.equal(findQuantumKnowledgeAnswer("Что такое ключ?", entries), null);
});

test("browser dialogue prompt uses real newlines and fits the model window", () => {
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
