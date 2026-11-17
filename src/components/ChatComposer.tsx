import { useState } from "react";

interface ChatComposerProps {
  onSend: (content: string) => void | Promise<void>;
  disabled: boolean;
  isGenerating: boolean;
  onStop: () => void;
}

export function ChatComposer({ onSend, disabled, isGenerating, onStop }: ChatComposerProps) {
  const [value, setValue] = useState("");

  function submit() {
    const content = value.trim();
    if (!content || disabled) return;
    setValue("");
    void onSend(content);
  }

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        id="chat-prompt"
        aria-label="Сообщение для QQ AI"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder="Спросите о чём-нибудь…"
        rows={1}
        maxLength={12000}
        disabled={disabled || isGenerating}
        aria-describedby="composer-hint"
      />
      {isGenerating ? (
        <button className="composer__send composer__stop" type="button" onClick={onStop} aria-label="Остановить ответ">
          <span aria-hidden="true">■</span>
        </button>
      ) : (
        <button className="composer__send" type="submit" disabled={disabled || !value.trim()} aria-label="Отправить сообщение">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-5 16-3-6-8-2Z" /><path d="m12 14 8-10" /></svg>
        </button>
      )}
      <span id="composer-hint" className="sr-only">Enter — отправить. Shift плюс Enter — новая строка.</span>
    </form>
  );
}
