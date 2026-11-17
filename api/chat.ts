export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  if (request.method !== "POST") return json({ error: "Метод не поддерживается." }, 405);
  const apiKey = process.env.AI_GATEWAY_API_KEY || request.headers.get("x-vercel-oidc-token") || process.env.VERCEL_OIDC_TOKEN;
  if (!apiKey) {
    return json({
      error: "Не удалось получить учётные данные Vercel AI Gateway. Проверь, включён ли AI Gateway для проекта QQ AI в Vercel."
    }, 503);
  }

  try {
    const body = await request.json() as { messages?: Array<{ role: "system" | "user" | "assistant"; content: string }> };
    if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 60) {
      return json({ error: "Некорректный формат диалога." }, 400);
    }
    const upstream = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: body.messages,
        temperature: 0.7,
        max_tokens: 1800,
        stream: true
      })
    });
    if (!upstream.ok) {
      const upstreamText = await upstream.text().catch(() => "");
      let detail = "";
      try {
        const parsed = JSON.parse(upstreamText);
        detail = parsed.error?.message || parsed.message || parsed.error || "";
        if (typeof detail !== "string") detail = JSON.stringify(detail);
      } catch {
        detail = upstreamText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      }
      return json({
        error: `AI Gateway ответил с кодом ${upstream.status}.${detail ? " Подробности: " + detail.slice(0, 500) : " Проверь доступ проекта и выбранную модель."}`
      }, upstream.status);
    }
    return new Response(upstream.body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform" }
    });
  } catch {
    return json({ error: "Не удалось обработать запрос на сервере QQ AI." }, 500);
  }
}