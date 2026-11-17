import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatComposer } from "./ChatComposer";

describe("ChatComposer", () => {
  it("does not submit an empty message", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatComposer onSend={onSend} disabled={false} isGenerating={false} onStop={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Отправить сообщение" }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("submits with Enter and preserves a newline with Shift+Enter", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatComposer onSend={onSend} disabled={false} isGenerating={false} onStop={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Сообщение для QQ AI" });
    await user.type(input, "Первый запрос");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    expect(onSend).toHaveBeenCalledWith("Первый запрос");
  });

  it("offers a stop action while generating", () => {
    const onStop = vi.fn();
    render(<ChatComposer onSend={vi.fn()} disabled={false} isGenerating onStop={onStop} />);
    fireEvent.click(screen.getByRole("button", { name: "Остановить ответ" }));
    expect(onStop).toHaveBeenCalledOnce();
  });
});
