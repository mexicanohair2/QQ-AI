import type { ChatAction, ChatState, Conversation } from "../../types/chat";

export const initialChatState: ChatState = {
  conversations: [],
  activeConversationId: null,
  generationId: null,
};

function updateConversation(
  state: ChatState,
  conversationId: string,
  update: (conversation: Conversation) => Conversation,
): ChatState {
  const index = state.conversations.findIndex((item) => item.id === conversationId);
  if (index < 0) return state;
  const conversations = [...state.conversations];
  conversations[index] = update(conversations[index]);
  return { ...state, conversations };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "conversation/create": {
      if (state.conversations.some((item) => item.id === action.conversation.id)) return state;
      return {
        ...state,
        conversations: [action.conversation, ...state.conversations],
        activeConversationId: action.conversation.id,
        generationId: null,
      };
    }
    case "conversation/select":
      return state.conversations.some((item) => item.id === action.id)
        ? { ...state, activeConversationId: action.id, generationId: null }
        : state;
    case "message/submit": {
      if (state.generationId || !state.conversations.some((item) => item.id === action.conversationId)) return state;
      return {
        ...updateConversation(state, action.conversationId, (conversation) => ({
          ...conversation,
          title: conversation.messages.length === 0
            ? action.userMessage.content.trim().slice(0, 42) || "Новый диалог"
            : conversation.title,
          messages: [...conversation.messages, action.userMessage, action.assistantMessage],
          updatedAt: action.userMessage.createdAt,
        })),
        generationId: action.generationId,
      };
    }
    case "assistant/complete": {
      if (state.generationId !== action.generationId) return state;
      const next = updateConversation(state, action.conversationId, (conversation) => ({
        ...conversation,
        messages: conversation.messages.map((message) =>
          message.id === action.assistantMessageId && message.status === "pending"
            ? { ...message, content: action.content, status: "complete" }
            : message,
        ),
        updatedAt: action.updatedAt,
      }));
      return { ...next, generationId: null };
    }
    case "assistant/fail": {
      if (state.generationId !== action.generationId) return state;
      const next = updateConversation(state, action.conversationId, (conversation) => ({
        ...conversation,
        messages: conversation.messages.map((message) =>
          message.id === action.assistantMessageId && message.status === "pending"
            ? { ...message, status: "error" }
            : message,
        ),
      }));
      return { ...next, generationId: null };
    }
    case "generation/stop": {
      if (state.generationId !== action.generationId) return state;
      const conversations = state.conversations.map((conversation) => ({
        ...conversation,
        messages: conversation.messages.map((message) =>
          message.status === "pending" ? { ...message, status: "error" as const } : message,
        ),
      }));
      return { ...state, conversations, generationId: null };
    }
    case "conversation/delete": {
      const conversations = state.conversations.filter((item) => item.id !== action.id);
      return {
        conversations,
        activeConversationId: state.activeConversationId === action.id
          ? conversations[0]?.id ?? null
          : state.activeConversationId,
        generationId: null,
      };
    }
    default:
      return state;
  }
}
