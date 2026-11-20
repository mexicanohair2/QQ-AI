import "../lib/qq-quantum-browser-runtime.js";
import type { QuantumBrowserAssets } from "../lib/qq-quantum-assets";

type BrowserApi = {
  ByteBPETokenizer: new (payload: unknown) => { encode(text: string, addBos?: boolean, addEos?: boolean): number[]; decode(ids: number[], skipSpecial?: boolean): string };
  QuantumBrowserModel: new (metadata: unknown, weights: ArrayBuffer) => { generate(ids: number[], maxTokens?: number, temperature?: number, topK?: number, eos?: number): number[] };
  inflateGzipBase64(value: string): Promise<ArrayBuffer>;
};
type WorkerMessage =
  | { type: "load"; assets: QuantumBrowserAssets }
  | { type: "chat"; requestId: string; messages: Array<{ role: string; content: string }> };
type QAItem = { question: string; answer: string; terms: Set<string> };
declare const self: {
  QQQuantumBrowser: BrowserApi;
  addEventListener(type: "message", listener: (event: MessageEvent<WorkerMessage>) => void): void;
  postMessage(message: unknown): void;
};

const STOP = new Set("а без бы в во вот все вы где да для до его ее если есть же за и из или им их к как ко когда кто ли мне мы на над не него нее ни но о об от по под при про раз с со так то тоже у уже что чтобы это этот я такое такой такая почему зачем расскажи объясни можно нужно чем является делает значит ты".split(/\s+/));
const WORDS = /[а-яёa-z0-9]+/gi;
let tokenizer: InstanceType<BrowserApi["ByteBPETokenizer"]> | null = null;
let model: InstanceType<BrowserApi["QuantumBrowserModel"]> | null = null;
let qa: QAItem[] = [];
let knownWords = new Set<string>();
let isReady = false;

function terms(text: string): string[] {
  return (text.toLocaleLowerCase("ru-RU").match(WORDS) ?? []).filter(word => word.length > 1 && !STOP.has(word));
}

function parseQA(corpus: string): QAItem[] {
  const result: QAItem[] = [];
  const seen = new Set<string>();
  let question: string | null = null;
  for (const raw of corpus.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("Пользователь:")) {
      question = line.slice("Пользователь:".length).trim();
      continue;
    }
    if (line.startsWith("QQ Quantum:") && question) {
      const answer = line.slice("QQ Quantum:".length).trim();
      const key = question.toLocaleLowerCase("ru-RU") + "\n" + answer.toLocaleLowerCase("ru-RU");
      if (answer && !seen.has(key)) {
        result.push({ question, answer, terms: new Set(terms(question)) });
        seen.add(key);
      }
      question = null;
    }
  }
  return result;
}

function searchLocal(query: string): string | null {
  const q = new Set(terms(query));
  if (!q.size) return null;
  let best: QAItem | null = null;
  let bestScore = -1;
  for (const item of qa) {
    let overlap = 0;
    for (const term of q) if (item.terms.has(term)) overlap++;
    const coverage = overlap / q.size;
    const precision = overlap / Math.max(1, item.terms.size);
    const score = coverage * (1 + precision * 0.7 + (coverage === 1 && precision === 1 ? 1.25 : 0));
    if (score > bestScore) { best = item; bestScore = score; }
  }
  return best && bestScore >= 0.68 ? best.answer : null;
}

function grounded(text: string): boolean {
  const words = (text.toLocaleLowerCase("ru-RU").match(WORDS) ?? []).filter(word => word.length >= 3);
  if (words.length < 3) return false;
  let count = 0;
  for (const word of words) if (knownWords.has(word)) count++;
  return count / words.length >= 0.55 && new Set(words).size / words.length >= 0.5;
}

function generateAnswer(message: string, history: Array<{ role: string; content: string }> = []): { answer: string; source: string } {
  const local = searchLocal(message);
  if (local) return { answer: local, source: "Локальная база QQ Quantum" };
  if (!tokenizer || !model) throw new Error("Модель QQ Quantum ещё не загружена.");
  const context = history.slice(-4).map(item => {
    const role = item.role === "assistant" ? "QQ Quantum" : "Пользователь";
    return role + ": " + String(item.content).slice(0, 220);
  }).join("\\n");
  const prompt = "Ты QQ Quantum — экспериментальная языковая модель. Отвечай по-русски кратко и честно. Если не знаешь, так и скажи.\\n" +
    context + (context ? "\\n" : "") +
    "Пользователь: " + message.slice(0, 700) + "\\nQQ Quantum:";
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
      const nextTokenizer = new self.QQQuantumBrowser.ByteBPETokenizer(message.assets.tokenizer);
      const nextModel = new self.QQQuantumBrowser.QuantumBrowserModel(message.assets.metadata, bytes);
      tokenizer = nextTokenizer;
      model = nextModel;
      qa = parseQA(message.assets.corpus);
      knownWords = new Set((message.assets.corpus.toLocaleLowerCase("ru-RU").match(WORDS) ?? []).filter(word => word.length >= 3));
      isReady = true;
      self.postMessage({
        type: "ready",
        trainingStep: message.assets.metadata.training_step,
        validationLoss: (message.assets.metadata as Record<string, unknown>).validation_loss ?? null,
      });
      return;
    }
    if (message.type === "chat") {
      if (!isReady) throw new Error("Сначала загрузи собственную модель QQ Quantum.");
      const lastUser = [...message.messages].reverse().find(item => item.role === "user")?.content ?? "";
      if (!lastUser.trim()) throw new Error("Пустое сообщение.");
      const history = message.messages.slice(-5).map(item => ({
        role: item.role,
        content: String(item.content).slice(0, 300),
      }));
      const result = generateAnswer(lastUser, history);
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
