import { buildGameAiMessages, parseGameAiResult, validateGameAiRequest } from "../src/lib/qqcross-ai";
import {
  buildChatCompletionPayload,
  modelEndpointRequiresApiKey,
  resolveModelApiKey,
  safeModelEndpoint,
} from "../src/lib/model-gateway.ts";

export const config = { runtime: "edge" };

function corsHeaders(request: Request): HeadersInit | null {
  const origin = request.headers.get("origin");
  if (!origin || origin === new URL(request.url).origin) return {};
  const allowed = (process.env.QQCROSS_ALLOWED_ORIGIN || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
}

const json = (body: unknown, status = 200, extraHeaders: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
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
  const cors = corsHeaders(request);
  if (cors === null) return json({ error: "Этот источник не разрешён для игрового ИИ." }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ error: "Метод не поддерживается." }, 405, cors);
  const apiKey = resolveModelApiKey(process.env.QQ_AI_API_KEY, process.env.DEEPSEEK_API_KEY, process.env.OPENAIAPIKEY);
  const endpoint = safeModelEndpoint(process.env.QQ_AI_API_URL?.trim());
  const model = process.env.QQ_AI_MODEL?.trim();
  if (!endpoint || !model || (modelEndpointRequiresApiKey(endpoint) && !apiKey)) {
    return json({ error: "Игровой ИИ QQ пока не настроен: проверь адрес API, модель и серверный ключ провайдера." }, 503, cors);
  }

  if (!(await authenticate(request))) return json({ error: "Для игрового ИИ нужен действующий вход QQCross/QQ AI." }, 401, cors);

  try {
    const rawBody = await request.text();
    if (rawBody.length > 12_000) return json({ error: "Запрос слишком большой." }, 413, cors);
    const body = JSON.parse(rawBody) as { request?: unknown };
    if (!validateGameAiRequest(body?.request)) return json({ error: "Некорректный запрос игрового ИИ." }, 400, cors);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const upstream = await fetch(safeEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: "Bearer " + apiKey } : {}),
        },
        body: JSON.stringify(buildChatCompletionPayload({
          endpoint,
          model,
          messages: buildGameAiMessages(body.request),
          temperature: 0.25,
          maxOutputTokens: 900,
          stream: false,
        })),
        signal: controller.signal,
      });
      if (!upstream.ok) {
        const status = upstream.status === 429 ? 429 : upstream.status >= 500 ? 502 : 503;
        return json({ error: "Провайдер игрового ИИ временно не смог обработать запрос." }, status, cors);
      }
      const payload = await upstream.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) return json({ error: "Игровой ИИ вернул пустой ответ." }, 502, cors);
      const result = parseGameAiResult(content, body.request);
      return json({ result }, 200, cors);
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
      : "Не удалось выполнить запрос игрового ИИ." }, 502, cors);
  }
}
