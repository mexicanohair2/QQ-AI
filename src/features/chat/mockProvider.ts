import type { ChatMessage } from "../../types/chat";
import type { ChatProvider } from "./provider";

export function createMockProvider(): ChatProvider {
  return {
    async send(messages: ChatMessage[], signal: AbortSignal): Promise<string> {
      if (signal.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }
      const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
      const context = latestUserMessage?.content.trim();
      return context
        ? `Я пока работаю в демонстрационном режиме: настоящая модель ещё не подключена. Я получил твоё сообщение: «${context.slice(0, 180)}». Когда подключим Qwen или облачную модель, здесь появятся полноценные ответы.`
        : "Я пока работаю в демонстрационном режиме. Настоящая модель ещё не подключена.";
    },
  };
}
