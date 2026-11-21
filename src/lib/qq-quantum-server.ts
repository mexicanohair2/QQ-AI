import "./qq-quantum-browser-runtime.js";
import modelAssets from "../../server/quantum/model.json";
import {
  buildQuantumPrompt,
  findQuantumKnowledgeAnswer,
  getQuantumKnownWords,
  indexQuantumKnowledge,
  normalizeQuantumWord,
} from "./qq-quantum-dialogue";

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
  const browser = (globalThis as typeof globalThis & { QQQuantumBrowser?: BrowserApi }).QQQuantumBrow¶»§q«^