import { pipeline } from "@huggingface/transformers";

type WorkerMessage =
  | { type: "load" }
  | { type: "transcribe"; requestId: string; samples: Float32Array };

const MODEL_ID = "onnx-community/whisper-tiny";
const MAX_SAMPLES = 16_000 * 20;

let transcriberPromise: Promise<any> | null = null;
let loadingPromise: Promise<void> | null = null;
let activeRequestId: string | null = null;

function post(type: string, extra: Record<string, unknown> = {}) {
  self.postMessage({ type, ...extra });
}

function reportProgress(event: Record<string, unknown>) {
  const progress = typeof event.progress === "number" && Number.isFinite(event.progress)
    ? Math.max(0, Math.min(100, Math.round(event.progress <= 1 ? event.progress * 100 : event.progress)))
    : null;
  post("progress", {
    progress,
    file: typeof event.file === "string" ? event.file : "",
    status: typeof event.status === "string" ? event.status : "",
  });
}

async function loadModel(): Promise<void> {
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const gpu = (navigator as Navigator & {
      gpu?: { requestAdapter: () => Promise<unknown> };
    }).gpu;
    if (!gpu) {
      throw new Error("Локальная расшифровка требует браузер с поддержкой WebGPU.");
    }
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      throw new Error("Браузер не обнаружил совместимый графический адаптер WebGPU.");
    }

    post("loading", { message: "Загружаем мультиязычную модель Whisper Tiny…" });
    transcriberPromise ??= pipeline(
      "automatic-speech-recognition",
      MODEL_ID,
      {
        device: "webgpu",
        dtype: "q8",
        progress_callback: reportProgress,
      },
    );

    const transcriber = await transcriberPromise;
    if (typeof transcriber !== "function") {
      throw new Error("Не удалось подготовить модель распознавания речи.");
    }
    post("ready", { modelId: MODEL_ID, sampleRate: 16_000, localOnly: true });
  })().catch(error => {
    transcriberPromise = null;
    loadingPromise = null;
    throw error;
  });
  return loadingPromise;
}

async function transcribe(requestId: string, samples: Float32Array) {
  if (activeRequestId) throw new Error("Локальная модель уже распознаёт другую запись.");
  if (!(samples instanceof Float32Array) || samples.length < 1 || samples.length > MAX_SAMPLES) {
    throw new Error("Аудиозапись имеет недопустимый размер.");
  }

  activeRequestId = requestId;
  try {
    await loadModel();
    const transcriber = await transcriberPromise!;
    post("transcribing", { requestId, message: "Распознаём русскую речь локально…" });
    const result = await transcriber(samples, {
      language: "russian",
      task: "transcribe",
    });
    const text = typeof result?.text === "string"
      ? result.text.replace(/\s+/g, " ").trim()
      : "";

    if (!text) throw new Error("Не удалось разобрать речь. Попробуй записать фразу ещё раз.");
    post("transcript", { requestId, text, modelId: MODEL_ID, localOnly: true });
  } finally {
    samples.fill(0);
    activeRequestId = null;
  }
}

self.addEventListener("message", async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;

  try {
    if (message.type === "load") {
      await loadModel();
      return;
    }
    if (message.type === "transcribe") {
      await transcribe(message.requestId, message.samples);
    }
  } catch (error) {
    post("error", {
      requestId: "requestId" in message ? message.requestId : null,
      message: error instanceof Error ? error.message : "Ошибка локальной расшифровки речи.",
    });
  }
});
