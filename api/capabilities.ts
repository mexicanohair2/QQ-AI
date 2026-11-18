export const config = { runtime: "edge" };
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET") return new Response(JSON.stringify({ error: "Метод не поддерживается." }), { status: 405 });
  const hasModel = Boolean(process.env.QQ_AI_API_URL?.trim() && process.env.QQ_AI_MODEL?.trim());
  const hasVision = Boolean(process.env.QQ_AI_VISION_API_URL?.trim() && process.env.QQ_AI_VISION_MODEL?.trim());
  const body = {
    onlineText: { state: hasModel ? "configured" : "unconfigured", model: hasModel ? process.env.QQ_AI_MODEL : null },
    webSearch: { state: "available", provider: "DuckDuckGo HTML + Bing HTML", providers: ["DuckDuckGo", "Bing"], note: "Используются поисковые фрагменты; полное извлечение страниц и синтез облачной моделью ещё не подключены." },
    imageUnderstanding: { state: hasVision ? "configured" : "unconfigured", note: "Это статус облачной Vision-модели." },
    localVision: {
      state: "implemented_device_check_required",
      runtime: "WebGPU browser worker",
      model: "HuggingFaceTB/SmolVLM-256M-Instruct",
      estimatedDownloadMb: { min: 190, max: 270 },
      audioAnalysis: false,
      note: "Модель скачивается только по нажатию пользователя. Она небольшая и англоязычная; качество русского текста и OCR может быть ограниченным. Нужна поддержка WebGPU; физический тест Honor 400 ещё не проведён.",
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
      note: "Запись до 20 секунд обрабатывается локально и вставляется в поле сообщения. Модель скачивается только после явного нажатия; требуется WebGPU. Перед отправкой проверь текст. Физический тест Honor 400 ещё не проведён.",
    },
    videoUnderstanding: { state: hasVision ? "configured" : "unconfigured", note: "Облачная модель не подключена. Локальный режим может анализировать до четырёх выбранных кадров с временными отметками; аудиодорожка не анализируется." },
    offlineText: { state: "available" }
  };
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}