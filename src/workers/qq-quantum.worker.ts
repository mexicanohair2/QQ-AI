import "../lib/qq-quantum-browser-runtime.js";
import type { QuantumBrowserAssets } from "../lib/qq-quantum-assets";
import {
  buildQuantumPrompt,
  findQuantumKnowledgeAnswer,
  getQuantumKnownWords,
  indexQuantumKnowledge,
  normalizeQuantumWord,
  type QuantumKnowledgeEntry,
} from "../lib/qq-quantum-dialogue";

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
type WorkerMessage =
  | { type: "load"; assets: QuantumBrowserAssets }
  | { type: "chat"; requestId: string; messages: Array<{ role: string; content: string }> };
declare const self: {
  QQQuantumBrowser: BrowserApi;
  addEventListener(type: "message", listener: (event: MessageEvent<WorkerMessage>) => void): void;
  postMessage(message: unknown): void;
};

let tokenizer: InstanceType<BrowserApi["ByteBPETokenizer"]> | null = null;
let model: InstanceType<BrowserApi["QuantumBrowserModel"]> | null = null;
let qa: QuantumKnowledgeEntry[] = [];
let knownWords = new Set<string>();
let isReady = false;

function grounded(text: string): boolean {
  const words = (text.toLocaleLowerCase("ru-RU").match(/[а-яёa-z0-9]+/gi) ?? [])
    .filter(word => word.length >= 3)
    .map(normalizeQuantumWord);
  if (words.length < 3) return false;
  let count = 0;
  for (const word of words) if (knownWords.has(word)) count++;
  return count / words.length >= 0.55 && new Set(words).size / words.length >= 0.5;
}

function generateAnswer(messages: Array<{ role: string; content: string }>): { answer: string; source: string } {
  const lastUser = [...messages].reverse().find(item => item.role === "user")?.content ?? "";
  const stored = findQuantumKnowledgeAnswer(lastUser, qa);
  if (stored) return { answer: stored, source: "Собственная база знаний QQ Quantum" };
  if (!tokenizer || !model) throw new Error("Модель QQ Quantum ещё не загружена.");
  const prompt = buildQuantumPrompt(messages, tokenizer.encode.bind(tokenizer), model.cfg.block_size);
  const ids = tokenizer.encode(prompt, true, false);
  const generated = model.generate(ids, 40, 0.7, 24, 2);
  const text = tokenizer.decode(generated, true).trim();
  if (!grounded(text)) {
    return {
      answer: "Пока не могу сформулировать надёжный связный ответ. Собственная модель ещё обучается; я не буду выдавать случайный текст за достоверную информацию.",
      source: "Защита от недостоверной генерации",
    };
  }
  return { answer: text, source: "Собственная модель QQ Quantum · экспериментальная генерация" };
}

self.addEventListener("message", async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;
  try {
    if (message.type === "load") {
      const bytes = await self.QQQuantumBrowser.inflateGzipBase64(message.assets.weights_gzip_base64);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const actualSha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      if (actualSha256 !== message.assets.metadata.weights_sha256) {
        throw new Error("Контрольная сумма весов QQ Quantum не совпала. Загрузка остановлена.");
      }
      const nextTokenizer = new self.QQQuantumBrowser.ByteBPETokenizer(message.assets.tokenizer);
      const nextModel = new self.QQQuantumBrowser.QuantumBrowserModel(message.assets.metadata, bytes);
      tokenizer = nextTokenizer;
      model = nextModel;
      qa = indexQuantumKnowledge(message.assets.corpus);
      knownWords = getQuantumKnownWords(message.assets.corpus);
      isReady = true;
      self.postMessage({
        type: "ready",
        trainingStep: message.assets.metadata.training_step,
        validationLoss: (message.assets.metadata as Record<string, unknown>).validation_loss ?? null,
        knowledgeQuestions: qa.length,
      });
      return;
    }
    if (message.type === "chat") {
      if (!isReady) throw new Error("Сначала загрузи собственную модель QQ Quantum.");
      const result = generateAnswer(message.messages);
      self.postMessage({ type: "answer", requestId: message.requestId, ...result });
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId: "requestId" in message ? message.requestId : null,
      message: error instanceof Error ? error.message : "Ошибка локальной модели QQ Quantum.",
    });
  }
});
