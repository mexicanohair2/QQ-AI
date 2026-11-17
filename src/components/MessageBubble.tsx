import type { ChatMessage } from "../types/chat";

interface MessageBubbleProps {
  message: ChatMessage;
  onRetry: () => void;
}

export function MessageBubble({ message, onRetry }: MessageBubbleProps) {
  const isUser = message.role === "user";
  async function copyMessage() {
    try {
      await navigator.clipboard?.writeText(message.content);
    } catch {
      // Clipboard access is optional; reading and sending messages must still work.
    }
  }

  return (
    <article className={`message message--${isUser ? "user" : "assistant"}`} aria-label={isUser ? "Ваше сообщение" : "Ответ QQ AI"}>
      {!isUser && <div className="message__avatar" aria-hidden="true"><span>Q</span></div>}
      <div className="message__body">
        <div className="message__meta">{isUser ? "Вы" : "QQ AI"}</div>
        <div className={`message__bubble${message.status === "error" ? " message__bubble--error" : ""}`}>
          {message.status === "pending" ? (
            <span className="typing-dots" aria-label="Формируется ответ"><i /><i /><i /></span>
          ) : message.status === "error" ? (
            <span>Не удалось завершить ответ. Попробуйте ещё раз.</span>
          ) : (
            <p>{message.content}</p>
          )}
        </div>
        {message.status === "error" && !isUser && (
          <button className="message__action" type="button" onClick={onRetry}>Повторить</button>
        )}
        {message.status === "complete" && message.content && (
          <button className="message__action" type="button" onClick={() => void copyMessage()}>Копировать</button>
        )}
      </div>
    </article>
  );
}
