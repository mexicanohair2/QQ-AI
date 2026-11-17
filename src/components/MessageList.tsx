import { useEffect, useRef } from "react";
import type { ChatMessage } from "../types/chat";
import { MessageBubble } from "./MessageBubble";

interface MessageListProps {
  messages: ChatMessage[];
  onRetry: () => void;
}

export function MessageList({ messages, onRetry }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <section className="welcome" aria-label="Начало разговора">
        <div className="welcome__orb" aria-hidden="true"><span>Q</span></div>
        <p className="eyebrow">ВАШ ЛИЧНЫЙ ПОМОЩНИК</p>
        <h2>С чего начнём?</h2>
        <p className="welcome__text">Задайте вопрос, попросите объяснить сложную тему или помогите себе разобраться с новой идеей.</p>
        <div className="welcome__suggestions">
          <span>Объясни простыми словами</span>
          <span>Помоги придумать идею</span>
          <span>Разбери задачу по шагам</span>
        </div>
      </section>
    );
  }

  return (
    <section className="message-list" aria-label="История сообщений" aria-live="polite">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} onRetry={onRetry} />
      ))}
      <div ref={endRef} />
    </section>
  );
}
