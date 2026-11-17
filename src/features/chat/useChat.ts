import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { ChatMessage, ChatState, Conversation } from "../../types/chat";
import { createId } from "../../lib/id";
import { chatReducer, initialChatState } from "./chatReducer";
import { createMockProvider } from "./mockProvider";
import type { ChatProvider } from "./provider";
import { loadConversations, saveConversations } from "./storage";

const defaultProvider = createMockProvider();

interface ActiveRequest {
  controller: AbortController;
  generationId: string;
  conversationId: string;
  assistantMessageId: string;
}

function makeConversation(): Conversation {
  const now = Date.now();
  return {
    id: createId(),
    title: "Новый диалог",
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export interface UseChatResult {
  state: ChatState;
  activeConversation: Conversation | null;
  isReady: boolean;
  sendMessage: (content: string) => Promise<void>;
  selectConversation: (id: string) => void;
  createConversation: () => void;
  deleteConversation: (id: string) => void;
  stopGeneration: () => void;
  retryLastMessage: () => Promise<void>;
}

export function useChat(provider: ChatProvider = defaultProvider): UseChatResult {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const [isReady, setIsReady] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const activeRequestRef = useRef<ActiveRequest | null>(null);
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    void loadConversations().then((conversations) => {
      if (cancelled) return;
      dispatch({ type: "state/restore", conversations });
      if (conversations.length === 0) {
        dispatch({ type: "conversation/create", conversation: makeConversation() });
      }
      setIsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isReady) return;
    const snapshot = state.conversations;
    persistenceQueueRef.current = persistenceQueueRef.current
      .catch(() => undefined)
      .then(() => saveConversations(snapshot));
  }, [isReady, state.conversations]);

  const stopGeneration = useCallback(() => {
    const request = activeRequestRef.current;
    if (!request) return;
    activeRequestRef.current = null;
    dispatch({
      type: "generation/stop",
      generationId: request.generationId,
      conversationId: request.conversationId,
      assistantMessageId: request.assistantMessageId,
    });
    request.controller.abort();
  }, []);

  const runProvider = useCallback(async (
    conversationId: string,
    messages: ChatMessage[],
    assistantMessageId: string,
    generationId: string,
  ) => {
    const controller = new AbortController();
    activeRequestRef.current = { controller, generationId, conversationId, assistantMessageId };
    try {
      const content = await provider.send(messages, controller.signal);
      if (controller.signal.aborted) return;
      dispatch({
        type: "assistant/complete",
        conversationId,
        assistantMessageId,
        generationId,
        content: typeof content === "string" ? content : String(content),
        updatedAt: Date.now(),
      });
    } catch {
      if (controller.signal.aborted) return;
      dispatch({ type: "assistant/fail", conversationId, assistantMessageId, generationId });
    } finally {
      if (activeRequestRef.current?.generationId === generationId) {
        activeRequestRef.current = null;
      }
    }
  }, [provider]);

  const createConversation = useCallback(() => {
    stopGeneration();
    dispatch({ type: "conversation/create", conversation: makeConversation() });
  }, [stopGeneration]);

  const selectConversation = useCallback((id: string) => {
    if (stateRef.current.activeConversationId === id) return;
    stopGeneration();
    dispatch({ type: "conversation/select", id });
  }, [stopGeneration]);

  const deleteConversation = useCallback((id: string) => {
    if (activeRequestRef.current?.conversationId === id) stopGeneration();
    dispatch({ type: "conversation/delete", id });
  }, [stopGeneration]);

  const sendMessage = useCallback(async (content: string) => {
    const normalized = content.trim();
    if (!isReady || !normalized || activeRequestRef.current) return;

    const currentState = stateRef.current;
    let conversation = currentState.conversations.find(
      (item) => item.id === currentState.activeConversationId,
    );
    if (!conversation) {
      conversation = makeConversation();
      dispatch({ type: "conversation/create", conversation });
    }

    const now = Date.now();
    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: normalized,
      createdAt: now,
      status: "complete",
    };
    const assistantMessage: ChatMessage = {
      id: createId(),
      role: "assistant",
      content: "",
      createdAt: now,
      status: "pending",
    };
    const generationId = createId();

    dispatch({
      type: "message/submit",
      conversationId: conversation.id,
      userMessage,
      assistantMessage,
      generationId,
    });
    await runProvider(
      conversation.id,
      [...conversation.messages, userMessage],
      assistantMessage.id,
      generationId,
    );
  }, [isReady, runProvider]);

  const retryLastMessage = useCallback(async () => {
    if (!isReady || activeRequestRef.current) return;
    const currentState = stateRef.current;
    const conversation = currentState.conversations.find(
      (item) => item.id === currentState.activeConversationId,
    );
    if (!conversation) return;

    const assistantIndex = conversation.messages.length - 1;
    const failedMessage = conversation.messages[assistantIndex];
    if (!failedMessage || failedMessage.role !== "assistant" || failedMessage.status !== "error") return;
    const previousMessage = conversation.messages[assistantIndex - 1];
    if (!previousMessage || previousMessage.role !== "user") return;

    const generationId = createId();
    dispatch({
      type: "message/retry",
      conversationId: conversation.id,
      assistantMessageId: failedMessage.id,
      generationId,
      updatedAt: Date.now(),
    });
    await runProvider(
      conversation.id,
      conversation.messages.slice(0, assistantIndex),
      failedMessage.id,
      generationId,
    );
  }, [isReady, runProvider]);

  useEffect(() => () => {
    activeRequestRef.current?.controller.abort();
    activeRequestRef.current = null;
  }, []);

  const activeConversation = state.conversations.find(
    (item) => item.id === state.activeConversationId,
  ) ?? null;

  return {
    state,
    activeConversation,
    isReady,
    sendMessage,
    selectConversation,
    createConversation,
    deleteConversation,
    stopGeneration,
    retryLastMessage,
  };
}
