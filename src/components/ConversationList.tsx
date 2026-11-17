import type { Conversation } from "../types/chat";

interface ConversationListProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

export function ConversationList({
  conversations, activeConversationId, onSelect, onCreate, onDelete,
}: ConversationListProps) {
  return (
    <div className="conversation-list">
      <div className="conversation-list__top">
        <span className="eyebrow">ВАША ИСТОРИЯ</span>
        <button className="new-chat-button" type="button" onClick={onCreate}>＋ Новый чат</button>
      </div>
      <div className="conversation-list__items">
        {conversations.map((conversation) => (
          <div className={`conversation-item${conversation.id === activeConversationId ? " conversation-item--active" : ""}`} key={conversation.id}>
            <button
              className="conversation-item__select"
              type="button"
              onClick={() => onSelect(conversation.id)}
              aria-current={conversation.id === activeConversationId ? "page" : undefined}
            >
              <span className="conversation-item__title">{conversation.title || "Новый диалог"}</span>
              <span className="conversation-item__date">{new Date(conversation.updatedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</span>
            </button>
            <button
              className="conversation-item__delete"
              type="button"
              aria-label={`Удалить диалог ${conversation.title || "Новый диалог"}`}
              onClick={() => onDelete(conversation.id)}
            >×</button>
          </div>
        ))}
        {conversations.length === 0 && <p className="conversation-list__empty">Здесь появятся ваши диалоги.</p>}
      </div>
      <div className="sidebar-footnote">История хранится в этом браузере.</div>
    </div>
  );
}
