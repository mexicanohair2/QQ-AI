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
    case "state/restore": {
      const conversations = action.conversations.map((conversation) => ({
        ...conversation,
        // A pending request cannot survive a page reload; make it explicitly retryable.
        messages: conversation.messages.map((message) =>
          message.status === "pending" ? { ...message, status: "error" as const } : message,
        ),
      }));
      return {
        conversations,
        activeConversationId: conversations[0]?.id ?? null,
        generationId: null,
      };
    }
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
    case "message/retry": {
      if (state.generationId) return state;
      const next = updateConversation(state, action.conversationId, (conversation) => {
        const index = conversation.messages.findIndex((message) => message.id === action.assistantMessageId);
        if (index < 1 || conversation.messages[index].role !== "assistant"
          || conversation.messages[index].status !== "error"
          || conversation.messages[index - 1].role !== "user") return conversation;
        const messages = [...conversation.messages];
        messages[index] = { ...messages[index], content: "", status: "pending", createdAt: action.updatedAt };
        return { ...conversation, messages, updatedAt: action.updatedAt };
      });
      if (next === state || next.conversations.every((item) =>
        item.id !== action.conversationId
        || !item.messages.some((message) => message.id === action.assistantMessageId && message.status === "pending"),
      )) return state;
      return { ...next, generationId: action.generationId };
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
    case "conversation/delete": {
      const conversations = state.conversations.filter((item) => item.id !== action.id);
      const deletingActive = state.activeConversationId === action.id;
      return {
        conversations,
        activeConversationId: deletingActive ? conversations[0]?.id ?? null : state.activeConversationId,
        generationId: deletingActive ? null : state.generationId,
      };
    }
    default:
      return state;
  }
}
