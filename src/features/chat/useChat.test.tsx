import { act, renderHook, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { useChat } from "./useChat";
import type { ChatProvider } from "./provider";

beforeEach(() => {
  Object.defineProperty(globalThis, "indexedDB", { value: new IDBFactory(), configurable: true });
  it("retries a failed reply without adding a duplicate user message", async () => {
    let callCount = 0;
    const provider: ChatProvider = {
      send: async () => {
        callCount += 1;
        if (callCount === 1) throw new Error("temporary provider failure");
        return "Успешный повторный ответ";
      },
    };
    const { result } = renderHook(() => useChat(provider));
    await waitFor(() => expect(result.current.isReady).toBe(true));

    await act(async () => {
      await result.current.sendMessage("Повтори этот ответ");
    });
    await waitFor(() => {
      expect(result.current.activeConversation?.messages[1].status).toBe("error");
    });

    await act(async () => {
      await result.current.retryLastMessage();
    });

    expect(result.current.activeConversation?.messages).toHaveLength(2);
    expect(result.current.activeConversation?.messages[0].content).toBe("Повтори этот ответ");
    expect(result.current.activeConversation?.messages[1]).toMatchObject({
      role: "assistant",
      content: "Успешный повторный ответ",
      status: "complete",
    });
    expect(callCount).toBe(2);
  });

});

describe("useChat", () => {
  it("creates a first conversation and sends a message with a mock reply", async () => {
    const { result } = renderHook(() => useChat());
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.activeConversation?.messages).toEqual([]);

    await act(async () => {
      await result.current.sendMessage("Привет");
    });

    await waitFor(() => {
      expect(result.current.activeConversation?.messages).toHaveLength(2);
      expect(result.current.activeConversation?.messages[1].status).toBe("complete");
    });
    expect(result.current.activeConversation?.messages[0].content).toBe("Привет");
  });

  it("restores conversations after remount", async () => {
    const first = renderHook(() => useChat());
    await waitFor(() => expect(first.result.current.isReady).toBe(true));
    await act(async () => { await first.result.current.sendMessage("Сохрани меня"); });
    await waitFor(() => expect(first.result.current.activeConversation?.messages).toHaveLength(2));
    first.unmount();

    const second = renderHook(() => useChat());
    await waitFor(() => expect(second.result.current.isReady).toBe(true));
    expect(second.result.current.activeConversation?.messages[0].content).toBe("Сохрани меня");
  });

  it("aborts a running generation and ignores a late provider result", async () => {
    const provider: ChatProvider = {
      send: (_messages, signal) => new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        setTimeout(() => resolve("late"), 20);
      }),
    };
    const { result } = renderHook(() => useChat(provider));
    await waitFor(() => expect(result.current.isReady).toBe(true));

    act(() => { void result.current.sendMessage("Останови ответ"); });
    await waitFor(() => expect(result.current.state.generationId).not.toBeNull());
    act(() => result.current.stopGeneration());

    await waitFor(() => expect(result.current.state.generationId).toBeNull());
    expect(result.current.activeConversation?.messages[1].status).toBe("error");
  });
});
