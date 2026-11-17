import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Conversation } from "../types/chat";
import { ConversationList } from "./ConversationList";

const conversations: Conversation[] = [
  { id: "c1", title: "Первый диалог", messages: [], createdAt: 1, updatedAt: 1 },
  { id: "c2", title: "Вторая тема", messages: [], createdAt: 2, updatedAt: 2 },
];

describe("ConversationList", () => {
  it("selects a conversation and marks the active one", () => {
    const onSelect = vi.fn();
    render(
      <ConversationList
        conversations={conversations}
        activeConversationId="c1"
        onSelect={onSelect}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const firstButton = screen.getByText("Первый диалог").closest("button");
    const secondButton = screen.getByText("Вторая тема").closest("button");
    expect(firstButton).toHaveAttribute("aria-current", "page");
    expect(secondButton).not.toBeNull();
    if (secondButton) fireEvent.click(secondButton);
    expect(onSelect).toHaveBeenCalledWith("c2");
  });

  it("starts a new conversation", () => {
    const onCreate = vi.fn();
    render(
      <ConversationList
        conversations={conversations}
        activeConversationId="c1"
        onSelect={vi.fn()}
        onCreate={onCreate}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Новый чат/ }));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("deletes only the requested conversation", () => {
    const onDelete = vi.fn();
    render(
      <ConversationList
        conversations={conversations}
        activeConversationId="c1"
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Удалить диалог Вторая тема" }));
    expect(onDelete).toHaveBeenCalledWith("c2");
  });
});
