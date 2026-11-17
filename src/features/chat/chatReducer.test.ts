import { describe, expect, it } from "vitest";
import { chatReducer, initialChatState } from "./chatReducer";

const conversation = {
  id: "c1",
  title: "Новый диалог",
  messages: [],
  createdAt: 10,
  updatedAt: 10,
};
const userMessage = {
  id: "m1", role: "user" as const, content: "Привет", createdAt: 11, status: "complete" as const,
};
const assistantMessage = {
  id: "m2", role: "assistant" as const, content: "", createdAt: 12, status: "pending" as const,
};

describe("chatReducer", () => {
  it("starts with an empty state", () => {
    expect(initialChatState).toEqual({ conversations: [], activeConversationId: null, generationId: null });
  });

  it("creates and selects a conversation", () => {
    const created = chatReducer(initialChatState, { type: "conversation/create", conversation });
    expect(created.conversations).toHaveLength(1);
    expect(created.activeConversationId).toBe("c1");
    expect(chatReducer(created, { type: "conversation/select", id: "missing" })).toBe(created);
  });

  it("submits a user message and a pending assistant placeholder", () => {
    const state = chatReducer(initialChatState, { type: "conversation/create", conversation });
    const next = chatReducer(state, {
      type: "message/submit",
      conversationId: "c1",
      userMessage,
      assistantMessage,
      generationId: "g1",
    });
    expect(next.conversations[0].messages.map((message) => message.id)).toEqual(["m1", "m2"]);
    expect(next.conversations[0].messages[1].status).toBe("pending");
    expect(next.generationId).toBe("g1");
  });

  it("completes the matching assistant response", () => {
    const started = chatReducer(
      chatReducer(initialChatState, { type: "conversation/create", conversation }),
      { type: "message/submit", conversationId: "c1", userMessage, assistantMessage, generationId: "g1" },
    );
    const completed = chatReducer(started, {
      type: "assistant/complete", conversationId: "c1", assistantMessageId: "m2",
      generationId: "g1", content: "Здравствуйте!", updatedAt: 13,
    });
    expect(completed.conversations[0].messages[1]).toMatchObject({ content: "Здравствуйте!", status: "complete" });
    expect(completed.generationId).toBeNull();
  });

  it("marks a failed assistant response as retryable", () => {
    const started = chatReducer(
      chatReducer(initialChatState, { type: "conversation/create", conversation }),
      { type: "message/submit", conversationId: "c1", userMessage, assistantMessage, generationId: "g1" },
    );
    const failed = chatReducer(started, {
      type: "assistant/fail", conversationId: "c1", assistantMessageId: "m2", generationId: "g1",
    });
    expect(failed.conversations[0].messages[1].status).toBe("error");
    expect(failed.generationId).toBeNull();
  });

  it("stops a generation and ignores stale completion", () => {
    const started = chatReducer(
      chatReducer(initialChatState, { type: "conversation/create", conversation }),
      { type: "message/submit", conversationId: "c1", userMessage, assistantMessage, generationId: "g1" },
    );
    const stopped = chatReducer(started, { type: "generation/stop", generationId: "g1", conversationId: "c1", assistantMessageId: "m2" });
    const stale = chatReducer(stopped, {
      type: "assistant/complete", conversationId: "c1", assistantMessageId: "m2",
      generationId: "g1", content: "Поздний ответ", updatedAt: 14,
    });
    expect(stopped.generationId).toBeNull();
    expect(stopped.conversations[0].messages[1].status).toBe("error");
    expect(stale).toBe(stopped);
  });

  it("retries an errored assistant message without duplicating the user message", () => {
    const started = chatReducer(
      chatReducer(initialChatState, { type: "conversation/create", conversation }),
      { type: "message/submit", conversationId: "c1", userMessage, assistantMessage, generationId: "g1" },
    );
    const failed = chatReducer(started, {
      type: "assistant/fail", conversationId: "c1", assistantMessageId: "m2", generationId: "g1",
    });
    const retried = chatReducer(failed, {
      type: "message/retry", conversationId: "c1", assistantMessageId: "m2", generationId: "g2", updatedAt: 14,
    });
    expect(retried.generationId).toBe("g2");
    expect(retried.conversations[0].messages).toHaveLength(2);
    expect(retried.conversations[0].messages[0].id).toBe("m1");
    expect(retried.conversations[0].messages[1]).toMatchObject({ id: "m2", status: "pending", content: "" });
  });

  it("restores unfinished responses as retryable errors", () => {
    const restored = chatReducer(initialChatState, {
      type: "state/restore",
      conversations: [{ ...conversation, messages: [userMessage, assistantMessage] }],
    });
    expect(restored.activeConversationId).toBe("c1");
    expect(restored.conversations[0].messages[1].status).toBe("error");
    expect(restored.generationId).toBeNull();
  });

  it("opens the most recently updated conversation after restore", () => {
    const older = { ...conversation, id: "older", title: "Старый", updatedAt: 10 };
    const newer = { ...conversation, id: "newer", title: "Новый", updatedAt: 20 };
    const restored = chatReducer(initialChatState, {
      type: "state/restore",
      conversations: [older, newer],
    });
    expect(restored.conversations.map((item) => item.id)).toEqual(["newer", "older"]);
    expect(restored.activeConversationId).toBe("newer");
  });

  it("deletes a conversation and clears active generation state", () => {
    const started = chatReducer(
      chatReducer(initialChatState, { type: "conversation/create", conversation }),
      { type: "message/submit", conversationId: "c1", userMessage, assistantMessage, generationId: "g1" },
    );
    const deleted = chatReducer(started, { type: "conversation/delete", id: "c1" });
    expect(deleted.conversations).toHaveLength(0);
    expect(deleted.activeConversationId).toBeNull();
    expect(deleted.generationId).toBeNull();
  });
});
