import "./qq-quantum-browser-runtime.js";
import modelAssets from "../../server/quantum/model.json" with { type: "json" };
import {
  buildQuantumPrompt,
  findQuantumKnowledgeAnswer,
  getQuantumKnownWords,
  indexQuantumKnowledge,
  normalizeQuantumWord,
} from "./qq-quantum-dialogue.ts";

type BrowserApi = {
  ByteBPETokenizer: new (payload: unknown) => {
    encode(text: string, addBos?: boolean, addEos?: boolean): number[];
    decode(ids: number[], skipSpecial?: boolean): string;
  };
  QuantumBrowserModel: new (metadata: unknown, weights: ArrayBuffer) => {
    cfg: { block_size: number };
    generate(ids: number[], maxTokens?: number, temperature?: number, topK?: number, eos?: number): number[];
  };
  inflateGzipBase64(value: string): Promise<ArrayBuffer>;
};
type QuantumMessage = { role: "system" | "user" | "assistant"; content: string };
type Runtime = {
  tokenizer: InstanceType<BrowserApi["ByteBPETokenizer"]>;
  model: InstanceType<BrowserApi["QuantumBrowserModel"]>;
  knowledge: ReturnType<typeof indexQuantumKnowledge>;
  knownWords: Set<string>;
};
type Assets = {
  metadata: { format: string; training_step: number; weight_bytes: number; weights_sha256: string };
  tokenizer: unknown;
  corpus: string;
  weights_gzip_base64: string;
};

const assets = modelAssets as unknown as Assets;
let runtimePromise: Promise<Runtime> | null = null;

async function loadRuntime(): Promise<Runtime> {
  const browser = (globalThis as typeof globalThis & { QQQuantumBrowser?: BrowserApi }).QQQuantumBrowser;
  if (!browser) throw new Error("QQ Quantum inference runtime failed to initialize.");
  if (assets.metadata?.format !== "qq-quantum-web-weights-v1" ||
      typeof assets.weights_gzip_base64 !== "string" || typeof assets.corpus !== "string") {
    throw new Error("QQ Quantum model package is missing or invalid.");
  }
  const weights = await browser.inflateGzipBase64(assets.weights_gzip_base64);
  if (weights.byteLength !== assets.metadata.weight_bytes) throw new Error("QQ Quantum model weight size mismatch.");
  const tokenizer = new browser.ByteBPETokenizer(assets.tokenizer);
  const model = new browser.QuantumBrowserModel(assets.metadata, weights);
  return {
    tokenizer,
    model,
    knowledge: indexQuantumKnowledge(assets.corpus),
    knownWords: getQuantumKnownWords(assets.corpus),
  };
}

function getRuntime(): Promise<Runtime> {
  if (!runtimePromise) {
    runtimePromise = loadRuntime().catch(error => {
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
}

function isGrounded(text: string, knownWords: Set<string>): boolean {
  const words = (text.toLocaleLowerCase("ru-RU").match(/[а-яёa-z0-9]+/gi) ?? [])
    .filter(word => word.length >= 3)
    .map(normalizeQuantumWord);
  if (words.length < 9 || words.length > 50) return false;

  const uniqueRatio = new Set(words).size / words.length;
  const knownRatio = words.filter(word => knownWords.has(word)).length / words.length;
  const hasSentenceEnding = /[.!?…]$/.test(text.trim());
  const hasFiniteVerb = /\b(?:является|бывает|был|была|были|будет|будут|может|могут|должен|должна|должны|позволяет|помогает|использует|включает|содержит|работает|создаёт|создает|выполняет|учится|обучается|называется|означает|состоит|производит|применяется|происходит|представляет|обеспечивает|связано|связан|связана|нужно|нужен|нужна|нужны|содержат|показывает|определяет|объясняет|относится|выполняют|образует|находится|считается)\b/i.test(text);
  const noRunawayRepetition = Math.max(...[...new Set(words)].map(word => words.filter(item => item === word).length)) <= 3;

  return knownRatio >= 0.9 &&
    uniqueRatio >= 0.62 &&
    hasSentenceEnding &&
    hasFiniteVerb &&
    noRunawayRepetition;
}

export async function answerWithQuantum(messages: QuantumMessage[]): Promise<string> {
  const lastUser = [...messages].reverse().find(item => item.role === "user")?.content?.trim() ?? "";
  if (!lastUser) return "Напиши вопрос или задачу.";
  const runtime = await getRuntime();
  const userTurns = messages.filter(item => item.role === "user").map(item => item.content.trim()).filter(Boolean);
  const previousUser = userTurns.length > 1 ? userTurns[userTurns.length - 2] : "";
  const known = findQuantumKnowledgeAnswer(lastUser, runtime.knowledge) ??
    (previousUser
      ? findQuantumKnowledgeAnswer(previousUser + " " + lastUser, runtime.knowledge)
      : null);
  if (known) return known;
  const prompt = buildQuantumPrompt(messages, runtime.tokenizer.encode.bind(runtime.tokenizer), runtime.model.cfg.block_size);
  const ids = runtime.tokenizer.encode(prompt, true, false);
  const capacity = Math.max(1, Math.min(48, runtime.model.cfg.block_size - ids.length));
  const generated = runtime.model.generate(ids, capacity, 0.1, 1, 2);
  const candidate = runtime.tokenizer.decode(generated, true).trim();
  if (isGrounded(candidate, runtime.knownWords)) return candidate;
  return "Я пока не могу надёжно сформулировать ответ на этот вопрос. Свободная генерация QQ Quantum ещё обучается; я не буду выдавать случайный текст за достоверный ответ или подменять собственную модель сторонним ИИ.";
}

export async function ensureQuantumReady() {
  await getRuntime();
  return getQuantumModelStatus();
}

export function getQuantumModelStatus() {
  return {
    state: "configured" as const,
    model: "QQ Quantum Online",
    trainingStep: assets.metadata.training_step,
    provider: "self-hosted QQ Quantum runtime",
  };
}
