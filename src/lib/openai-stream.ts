type OpenAIChunk = {
  choices?: Array<{
    delta?: { content?: string | Array<{ text?: string }> };
    message?: { content?: string | Array<{ text?: string }> };
  }>;
  error?: { message?: string };
};

function contentFromPayload(payload: string): string {
  let parsed: OpenAIChunk;
  try {
    parsed = JSON.parse(payload) as OpenAIChunk;
  } catch {
    throw new Error("Онлайн-модель вернула некорректный поток данных.");
  }
  if (parsed.error?.message) throw new Error(parsed.error.message.slice(0, 500));
  const value = parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(part => part.text || "").join("");
  return "";
}

/** Reads OpenAI-compatible SSE, including CRLF, split chunks and a final unterminated event. */
export async function readOpenAIChatStream(
  body: ReadableStream<Uint8Array>,
  onToken: (token: string) => void,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let finished = false;

  const append = (payload: string) => {
    const value = payload.trim();
    if (!value || value === "[DONE]") {
      if (value === "[DONE]") finished = true;
      return;
    }
    const token = contentFromPayload(value);
    if (!token) return;
    answer += token;
    if (answer.length > 120_000) throw new Error("Ответ модели превысил допустимый размер.");
    onToken(token);
  };

  const consumeEvent = (event: string) => {
    const data = event
      .split(/\r\n|\n|\r/)
      .filter(line => line.startsWith("data:"))
      .map(line => line.slice(5).replace(/^ /, ""));
    if (data.length) append(data.join("\n"));
  };

  try {
    while (!finished) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      while (!finished) {
        const match = /\r\n\r\n|\n\n|\r\r/.exec(buffer);
        if (!match || match.index === undefined) break;
        consumeEvent(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
      }
    }

    buffer += decoder.decode();
    if (!finished && buffer.trim()) {
      if (/^\s*data:/m.test(buffer)) consumeEvent(buffer);
      else append(buffer);
    }
    if (!answer.trim()) throw new Error("Онлайн-модель вернула пустой ответ.");
    return answer;
  } finally {
    if (!finished) {
      try { await reader.cancel(); } catch { /* stream may already be closed */ }
    }
    reader.releaseLock();
  }
}
