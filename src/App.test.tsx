import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("./features/chat/storage", () => ({
  loadConversations: vi.fn().mockResolvedValue([]),
  saveConversations: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("QQ AI application", () => {
  it("renders the application landmark and product title", () => {
    render(<App />);
    expect(screen.getByRole("main", { name: /qq ai/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "QQ AI" })).toBeInTheDocument();
    expect(screen.getByText("Демонстрационный режим")).toBeInTheDocument();
  });

  it("allows a user to send their first prompt and receive a clearly labelled demo reply", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "С чего начнём?" });
    const composer = screen.getByRole("textbox", { name: "Сообщение для QQ AI" });
    await user.type(composer, "Привет, QQ AI!");
    await user.keyboard("{Enter}");
    expect(await screen.findByText("Привет, QQ AI!")).toBeInTheDocument();
    expect(await screen.findByText(/я пока работаю в демонстрационном режиме/i)).toBeInTheDocument();
  });
});
