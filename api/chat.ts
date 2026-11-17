export const config = { runtime: "edge" };

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export default async function handler(request: Request): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });

  if (request.method !== "POST") {
    return json({ error: "Метод не поддерживается." }, 405);
  }

  // Calls Cerebras directly. No Vercel AI Gateway or OIDC billing dependency.
  // Keep this key in Vercel Environment Variables; never expose it to the browser.
  const apiKey = process.env.CEREBRAS_API_KEY?.trim();
  if (!apiKey) {
    return json({
      error: "Облачная модель пока не подключена: на сервере QQ AI не задан CEREBRAS_API_KEY. Ключ должен быть добавлен взрослым владельцем проекта в защищённые переменные Vercel. Не отправляй API-ключ в чат.",
    }, 503);
  }

  try {
    const body = await request.json() as { messages?: ChatMessage[] };
    if (
      !Array.isArray(body.messages) ||
      body.messages.length === 0 ||
      body.messages.length > 60 ||
      body.messages.some((message) =>
        !message ||
        !["system", "user", "assistant"].includes(message.role) ||
        typeof message.content !== "string" ||
        message.content.length > 20000
      )
    ) {
      return json({ error: "Некорректный формат диалога." }, 400);
    }

    const model = process.env.CEREBRAS_MODEL?.trim() || "zai-glm-4.7";
    const upstream = await fetch("https://api.cerebras.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: body.messages,
        temperature: 0.8,
        top_p: 0.95,
        max_completion_tokens: 1800,
        reasoning_effort: "none",
        stream: true,
      }),
    });

    if (!upstream.ok) {
      const upstreamText = await upstream.text().catch(() => "");
      let detail = "";
      try {
        const parsed = JSON.parse(upstreamText);
        const value = parsed.error?.message || parsed.message || parsed.error || "";
        detail = typeof value === "string" ? value : JSON.stringify(value);
      } catch {
        detail = upstreamText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      }

      let reason = "";
      if (upstream.status === 401) reason = " Проверь CEREBRAS_API_KEY: ключ недействителен или отозван.";
      else if (upstream.status === 402) reason = " Стартовые кредиты закончились; платное пополнение не выполнялось.";
      else if (upstream.status === 429) reason = " Достигнут временный лимит запросов. Попробуй позже.";
      else if (upstream.status === 403) reason = " Провайдер отклонил запрос из-за доступа или ограничений аккаунта.";
      return json({
        error: `Cerebras API ответил с кодом ${upstream.status}.${reason}${detail ? " Подробности: " + detail.slice(0, 400) : ""}`,
      }, upstream.status);
    }

    if (!upstream.body) {
      return json({ error: "Cerebras API не вернул поток ответа." }, 502);
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    return json({
      error: `Не удалось связаться с Cerebras API.${detail ? " " + detail.slice(0, 250) : ""}`,
    }, 502);
  }
}