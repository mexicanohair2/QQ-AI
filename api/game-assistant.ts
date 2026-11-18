import { buildGameAiMessages, parseGameAiResult, validateGameAiRequest } from "../src/lib/qqcross-ai";

export const config = { runtime: "edge" };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

async function authenticate(request: Request): Promise<boolean> {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!token || !supabaseUrl || !anonKey) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(supabaseUrl + "/auth/v1/user", {
      headers: { apikey: anonKey, Authorization: "Bearer " + token },
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Метод не поддерживается." }, 405);
  const apiKey = process.env.CEREBRAS_API_KEY?.trim();
  if (!apiKey) return json({ error: "Игровой ИИ пока не подключён: серверный провайдер не настроен." }, 503);

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > 12_000) return json({ error: "Запрос слишком большой." }, 413);
  if (!(await authenticate(request))) return json({ error: "Для игрового ИИ нужен действующий вход QQCross/QQ AI." }, 401);

  try {
    const body = await request.json() as { request?: unknown };
    if (!validateGameAiRequest(body?.request)) return json({ error: "Некорректный запрос игрового ИИ." }, 400);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const upstream = await fetch("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.CEREBRAS_MODEL?.trim() || "zai-glm-4.7",
          messages: buildGameAiMessages(body.request),
          temperature: 0.25,
          max_completion_tokens: 900,
          reasoning_effort: "none",
          stream: false,
        }),
        signal: controller.signal,
      });
      if (!upstream.ok) {
        const status = upstream.status === 429 ? 429 : upstream.status >= 500 ? 502 : 503;
        return json({ error: "Провайдер игрового ИИ временно не смог обработать запрос." }, status);
      }
      const payload = await upstream.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) return json({ error: "Игровой ИИ вернул пустой ответ." }, 502);
      const result = parseGameAiResult(content, body.request);
      return json({ result });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return json({ error: message === "Модель вернула некорректный JSON." ||
      message === "Подсказка не прошла проверку формата." ||
      message === "Объяснение не прошло проверку формата." ||
      message === "Набор вопросов не прошёл проверку структуры." ||
      message === "Вопрос содержит ответ и был отклонён." ||
      message === "Подсказка раскрывает ответ и была отклонена."
      ? message
      : "Не удалось выполнить запрос игрового ИИ." }, 502);
  }
}
