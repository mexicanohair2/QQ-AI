import {
  modelEndpointRequiresApiKey,
  resolveModelApiKey,
  safeModelEndpoint,
} from "../src/lib/model-gateway.ts";

export const config = { runtime: "edge" };
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET") return new Response(JSON.stringify({ error: "Метод не поддерживается." }), { status: 405 });

  // Text generation is powered only by the user's own QQ Quantum service.
  // The model package is bundled with the server-side chat function.
  const hasModel = true;

  // Vision remains a separate optional tool; it never replaces the language model.
  const visionEndpoint = safeModelEndpoint(process.env.QQ_AI_VISION_API_URL?.trim());
  const visionModel = process.env.QQ_AI_VISION_MODEL?.trim();
  const visionKey = resolveModelApiKey(
    process.env.QQ_AI_VISION_API_KEY,
    process.env.QQ_AI_API_KEY,
    process.env.DEEPSEEK_API_KEY,
    process.env.OPENAIAPIKEY,
  );
  const hasVision = Boolean(visionEndpoint && visionModel &&
    (!modelEndpointRequiresApiKey(visionEndpoint) || visionKey));
  const body = {
    onlineText: {
      state: hasModel ? "configured" : "unconfigured",
      model: hasModel ? "QQ Quantum Online" : null,
      provider: "self-hosted QQ Quantum",
      note: hasModel
        ? "Собственная QQ Quantum работает на сервере; веса не скачиваются на устройство. Свободная генерация пока экспериментальная, неизвестные вопросы могут получать честный отказ."
        : "Собственная серверная модель QQ Quantum временно недоступна. Сторонние языковые модели не используются.",
    },
    webSearch: {
      state: "available",
      provider: "DuckDuckGo HTML + Bing HTML + Wikimedia API",
      providers: ["DuckDuckGo", "Bing", "Wikipedia (RU)"],
      note: "Поиск работает отдельно; найденные фрагменты показываются с источниками, без выдуманного пересказа моделью.",
    },
    imageUnderstanding: { state: hasVision ? "configured" : "unconfigured", note: "Отдельный облачный Vision-инструмент. Это не основной генератор текста." },
    localVision: {
      state: "implemented_device_check_required",
      runtime: "WebGPU browser worker",
      model: "HuggingFaceTB/SmolVLM-256M-Instruct",
      estimatedDownloadMb: { min: 190, max: 270 },
      audioAnalysis: false,
      note: "Модель скачивается только по нажатию пользователя. Она небольшая и англоязычная; качество русского текста и OCR может быть ограниченным. Нужна поддержка WebGPU; физический тест Honor 400 ещё не проведён. Для экономии памяти на устройстве одновременно используется только одна тяжёлая локальная модель — текст, Vision или Whisper.",
    },
    localSpeech: {
      state: "implemented_device_check_required",
      runtime: "WebGPU browser worker",
      model: "onnx-community/whisper-tiny",
      dtype: "q8",
      languages: "multilingual; Russian transcription",
      estimatedDownloadMb: { min: 70, max: 90 },
      maxRecordingSeconds: 20,
      sampleRateHz: 16000,
      audioSentToServer: false,
      note: "Запись до 20 секунд обрабатывается локально и вставляется в поле сообщения. Модель скачивается только после явного нажатия; требуется WebGPU. Перед отправкой проверь текст. Одновременно с ней не держатся другие тяжёлые локальные модели. Физический тест Honor 400 ещё не проведён.",
    },
    videoUnderstanding: { state: hasVision ? "configured" : "unconfigured", note: "Облачная модель не подключена. Локальный режим может анализировать до четырёх выбранных кадров с временными отметками; аудиодорожка не анализируется." },
    offlineText: {
      state: "implemented_import_required",
      provider: "own QQ Quantum browser Transformer",
      runtime: "pure JavaScript Web Worker",
      packageFormat: "QQ_Quantum_Offline.html",
      storage: "IndexedDB",
      requiresModelImport: true,
      networkAccess: false,
      note: "Собственная локальная модель реализована. Импортируй официальный автономный HTML-пакет QQ Quantum, затем загрузи его в Worker. После сохранения в IndexedDB ответы формируются без сетевых запросов. Физический тест Android ещё не проведён.",
    },
  };
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
