import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockProvider } from "./mockProvider";
import type { ChatMessage } from "../../types/chat";

const messages: ChatMessage[] = [{
  id: "m1", role: "user", content: "Привет", createdAt: 1, status: "complete",
}];

describe("mock provider", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns a non-empty response for a user message", async () => {
    const reply = await createMockProvider().send(messages, new AbortController().signal);
    expect(reply.trim().length).toBeGreaterThan(0);
    expect(reply).toContain("демонстрационном режиме");
  });

  it("rejects a request that has already been aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(createMockProvider().send(messages, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("does not make network requests", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await createMockProvider().send(messages, new AbortController().signal);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
