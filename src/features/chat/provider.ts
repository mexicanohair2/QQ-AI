import type { ChatMessage } from "../../types/chat";

export interface ChatProvider {
  send(messages: ChatMessage[], signal: AbortSignal): Promise<string>;
}
