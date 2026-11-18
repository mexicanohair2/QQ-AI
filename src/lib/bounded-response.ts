/** Reads a byte stream without buffering beyond the configured byte limit. */
async function readBodyTextLimited(body: ReadableStream<Uint8Array> | null, declaredLength: string | null, maxBytes: number): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error("Некорректный лимит размера тела.");
  }

  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxBytes) {
    throw new Error("Тело запроса или ответ превышает допустимый размер.");
  }
  if (!body) return "";

  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let receivedBytes = 0;
  let result = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > maxBytes) {
        try { await reader.cancel(); } catch { /* the stream may already be closing */ }
        throw new Error("Тело запроса или ответ превышает допустимый размер.");
      }
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode();
    return result;
  } finally {
    reader.releaseLock();
  }
}

export function readResponseTextLimited(response: Response, maxBytes: number): Promise<string> {
  return readBodyTextLimited(response.body, response.headers.get("content-length"), maxBytes);
}

export function readRequestTextLimited(request: Request, maxBytes: number): Promise<string> {
  return readBodyTextLimited(request.body, request.headers.get("content-length"), maxBytes);
}
