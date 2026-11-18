import type { GameAiRequest, GameAiResult } from "./qqcross-ai";

export async function requestQQCrossGameAi(
  request: GameAiRequest,
  accessToken: string,
  endpoint = "/api/game-assistant",
  signal?: AbortSignal,
): Promise<GameAiResult> {
  if (!accessToken.trim()) throw new Error("Для игрового ИИ требуется действующий токен входа.");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ request }),
    signal,
  });
  const payload = await response.json().catch(() => ({})) as {
    result?: GameAiResult;
    error?: string;
  };
  if (!response.ok) throw new Error(payload.error || `Игровой ИИ вернул ошибку ${response.status}.`);
  if (!payload.result || payload.result.task !== request.task) {
    throw new Error("Получен некорректный ответ игрового ИИ.");
  }
  return payload.result;
}
