export const config = { runtime: "edge" };
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET") return new Response(JSON.stringify({ error: "Метод не поддерживается." }), { status: 405 });
  const hasModel = Boolean(process.env.QQ_AI_API_URL?.trim() && process.env.QQ_AI_MODEL?.trim());
  const hasVision = Boolean(process.env.QQ_AI_VISION_API_URL?.trim() && process.env.QQ_AI_VISION_MODEL?.trim());
  const body = {
    onlineText: { state: hasModel ? "configured" : "unconfigured", model: hasModel ? process.env.QQ_AI_MODEL : null },
    webSearch: { state: "available", provider: "DuckDuckGo HTML search", note: "Используются поисковые фрагменты; полное извлечение страниц ещё не подключено." },
    imageUnderstanding: { state: hasVision ? "configured" : "unconfigured" },
    videoUnderstanding: { state: hasVision ? "pipeline_pending" : "unconfigured", note: "Извлечение видеокадров и анализ с временными метками ещё не подключены." },
    offlineText: { state: "available", model: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC" }
  };
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}