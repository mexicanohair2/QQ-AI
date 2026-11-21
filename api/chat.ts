import type { VercelRequest, VercelResponse } from "@vercel/node";

const SYSTEM = "Ты — QQ AI, полезный, точный и спокойный русскоязычный ИИ-помощник. Отвечай на языке пользователя. Сначала дай прямой ответ, затем объяснение по необходимости. Не выдумывай факты, источники и выполненные действия. Если информации недостаточно, честно обозначь неопределённость. Используй Markdown и избегай лишней воды.";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  const key = process.env.QWEN_API_KEY;
  if (!key) return res.status(503).json({ code: "MODEL_NOT_CONFIGURED", error: "Онлайн-модель ещё не подключена к серверу. Скачивать веса на телефон не нужно — подключение настраивается один раз на сервере." });
  let body: any;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; } catch { return res.status(400).json({ error: "Некорректный формат запроса." }); }
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (!messages.length || messages.length > 40) return res.status(400).json({ error: "Некорректная история диалога." });
  const safe = messages.filter((m: any) => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string").map((m: any) => ({ role: m.role, content: m.content.slice(0, 24000) }));
  if (!safe.length || safe[safe.length - 1].role !== "user") return res.status(400).json({ error: "Последнее сообщение должно быть сообщением пользователя." });
  const base = (process.env.QWEN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1").replace(/\/+$/, "");
  const model = process.env.QWEN_MODEL || "qwen-plus";
  try {
    const upstream = await fetch(base + "/chat/completions", { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" }, body: JSON.stringify({ model, messages: [{ role: "system", content: SYSTEM }, ...safe], stream: true, temperature: 0.65 }) });
    if (!upstream.ok || !upstream.body) { const detail = await upstream.text().catch(() => ""); console.error("Model provider:", upstream.status, detail.slice(0, 800)); return res.status(502).json({ error: "Сервер модели временно не ответил. Попробуй ещё раз." }); }
    res.status(200); res.setHeader("Content-Type", "text/event-stream; charset=utf-8"); res.setHeader("Cache-Control", "no-cache, no-transform"); res.setHeader("Connection", "keep-alive"); res.setHeader("X-Accel-Buffering", "no");
    const reader = upstream.body.getReader();
    try { while (true) { const part = await reader.read(); if (part.done) break; res.write(Buffer.from(part.value)); } res.end(); }
    catch (error) { console.error("Model stream interrupted:", error); if (!res.writableEnded) res.end(); }
  } catch (error) { console.error("Model connection:", error); if (!res.headersSent) return res.status(502).json({ error: "Не удалось связаться с сервером модели." }); if (!res.writableEnded) res.end(); }
}
