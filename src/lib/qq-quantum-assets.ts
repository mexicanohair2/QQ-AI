export type QuantumBrowserAssets = {
  metadata: {
    format: string;
    training_step: number;
    weight_bytes: number;
    model_config: Record<string, number>;
    tensors: Record<string, { offset: number; length: number; shape: number[] }>;
  };
  tokenizer: { format: string; real_size: number; [key: string]: unknown };
  corpus: string;
  weights_gzip_base64: string;
};

const DB_NAME = "qq-ai-quantum-model";
const STORE_NAME = "assets";
const RECORD_KEY = "active-v1";
const MAX_HTML_BYTES = 8 * 1024 * 1024;
const MAX_WEIGHTS_BASE64 = 6 * 1024 * 1024;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) {
      reject(new Error("Браузер не поддерживает IndexedDB для локального хранения модели."));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Не удалось открыть локальное хранилище модели."));
    request.onblocked = () => reject(new Error("Хранилище модели заблокировано другой вкладкой."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Ошибка IndexedDB."));
  });
}

export async function saveQuantumAssets(assets: QuantumBrowserAssets): Promise<void> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(assets, RECORD_KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Не удалось сохранить модель."));
      tx.onabort = () => reject(tx.error ?? new Error("Сохранение модели отменено."));
    });
  } finally {
    db.close();
  }
}

export async function loadQuantumAssets(): Promise<QuantumBrowserAssets | null> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(STORE_NAME, "readonly");
    const value = await requestResult<QuantumBrowserAssets | undefined>(tx.objectStore(STORE_NAME).get(RECORD_KEY));
    return value ?? null;
  } finally {
    db.close();
  }
}

function validateAssets(value: unknown): asserts value is QuantumBrowserAssets {
  if (!value || typeof value !== "object") throw new Error("В HTML-файле не найдены данные QQ Quantum.");
  const assets = value as Record<string, unknown>;
  const metadata = assets.metadata as Record<string, unknown> | undefined;
  const tokenizer = assets.tokenizer as Record<string, unknown> | undefined;
  if (metadata?.format !== "qq-quantum-web-weights-v1" || tokenizer?.format !== "qq-byte-bpe-v1") {
    throw new Error("Файл не является официальной автономной сборкой QQ Quantum.");
  }
  if (typeof assets.corpus !== "string" || assets.corpus.length > 1_000_000) {
    throw new Error("Локальный корпус QQ Quantum повреждён или слишком велик.");
  }
  if (typeof assets.weights_gzip_base64 !== "string" ||
      assets.weights_gzip_base64.length === 0 ||
      assets.weights_gzip_base64.length > MAX_WEIGHTS_BASE64 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(assets.weights_gzip_base64)) {
    throw new Error("Файл весов QQ Quantum имеет неправильный формат.");
  }
  const weightBytes = Number(metadata.weight_bytes);
  const config = metadata.model_config as Record<string, unknown> | undefined;
  const embd = Number(config?.n_embd);
  const heads = Number(config?.n_head);
  if (!Number.isSafeInteger(weightBytes) || weightBytes <= 0 || weightBytes > 16 * 1024 * 1024 ||
      !config || !Number.isInteger(config.vocab_size) || !Number.isInteger(config.block_size) ||
      !Number.isInteger(config.n_layer) || !Number.isInteger(heads) ||
      !Number.isInteger(embd) || heads < 1 || embd < 1 || embd % heads !== 0) {
    throw new Error("Конфигурация модели QQ Quantum не прошла проверку.");
  }
  if (!metadata.tensors || typeof metadata.tensors !== "object") {
    throw new Error("В модели QQ Quantum отсутствуют параметры нейросети.");
  }
}

export function parseQuantumModelHtmlText(html: string): QuantumBrowserAssets {
  if (typeof html !== "string" || new TextEncoder().encode(html).byteLength <= 0 ||
      new TextEncoder().encode(html).byteLength > MAX_HTML_BYTES) {
    throw new Error("HTML-файл QQ Quantum пустой или превышает 8 МБ.");
  }
  if (!/<!doctype html/i.test(html.slice(0, 256))) {
    throw new Error("Файл не похож на автономную HTML-сборку QQ Quantum.");
  }
  const marker = /const\\s+QQ_ASSETS\\s*=\\s*/i.exec(html);
  if (!marker) throw new Error("Не удалось найти встроенные данные QQ Quantum в HTML-файле.");
  let start = marker.index + marker[0].length;
  while (/\\s/.test(html[start] ?? "")) start += 1;
  if (html[start] !== "{") throw new Error("Встроенные данные QQ Quantum имеют неправильный формат.");

  // Extract the complete JSON object without evaluating any HTML/JavaScript.
  // This parser respects quoted braces and escaped quotation marks.
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\\\\\\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === "{" || char === "[") stack.push(char);
    else if (char === "}" || char === "]") {
      const open = stack.pop();
      if ((char === "}" && open !== "{") || (char === "]" && open !== "[")) {
        throw new Error("Встроенные данные QQ Quantum имеют повреждённую структуру.");
      }
      if (stack.length === 0) { end = index + 1; break; }
    }
  }
  if (end < 0) throw new Error("Встроенные данные QQ Quantum обрезаны.");
  let parsed: unknown;
  try { parsed = JSON.parse(html.slice(start, end)); }
  catch { throw new Error("Встроенные данные модели повреждены. Скачай HTML-сборку повторно."); }
  validateAssets(parsed);
  return parsed;
}

export async function importQuantumModelHtml(file: File): Promise<QuantumBrowserAssets> {
  if (!(file instanceof File) || file.size <= 0 || file.size > MAX_HTML_BYTES) {
    throw new Error("Выбери HTML-файл QQ Quantum размером не более 8 МБ.");
  }
  const assets = parseQuantumModelHtmlText(await file.text());
  await saveQuantumAssets(assets);
  return assets;
}
