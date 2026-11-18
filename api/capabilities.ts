export const config = { runtime: "edge" };
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET") return new Response(JSON.stringify({ error: "Метод не поддерживается." }), { status: 405 });
  const hasModel = Boolean(process.env.QQ_AI_API_URL?.trim() && process.env.QQ_AI_MODEL?.trim());
  const hasVision = Boolean(process.env.QQ_AI_VISION_API_URL?.trim() && process.env.QQ_AI_VISION_MODEL?.trim());
  const body = {
    onlineText: { state: hasModel ? "configured" : "unconfigured", model: hasModel ? process.env.QQ_AI_MODEL : null },
    webSearch: { state: "available", provider: "DuckDuckGo HTML + Bing HTML", providers: ["DuckDuckGo", "Bing"], note: "Используются поисковые фрагменты; полное извлечение страниц и синтез облачной моделью ещё не подключены." },
    imageUnderstanding: { state: hasVision ? "configured" : "unconfigured" },
    videoUnderstanding: { state: hasVision ? "configured" : "unconfigured", note: "Кадры выбираются локально; аудиодорожка пока не анализируется." },
    offlineText: { state: "available" }
  };
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}