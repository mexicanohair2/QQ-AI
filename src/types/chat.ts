export type MessageRole = "user" | "assistant";
export type MessageStatus = "complete" | "pending" | "error";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  status: MessageStatus;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  generationId: string | null;
}

export type ChatAction =
  | { type: "state/restore"; conversations: Conversation[] }
  | { type: "conversation/create"; conversation: Conversation }
  | { type: "conversation/select"; id: string }
  | { type: "message/submit"; conversationId: string; userMessage: ChatMessage; assistantMessage: ChatMessage; generationId: string }
  | { type: "message/retry"; conversationId: string; assistantMessageId: string; generationId: string; updatedAt: number }
  | { type: "assistant/complete"; conversationId: string; assistantMessageId: string; generationId: string; content: string; updatedAt: number }
  | { type: "assistant/fail"; conversationId: string; assistantMessageId: string; generationId: string }
  | { type: "generation/stop"; generationId: string; conversationId: string; assistantMessageId: string }
  | { type: "conversation/delete"; id: string };
