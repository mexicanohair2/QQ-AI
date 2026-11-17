import { useState } from "react";
import type { ChatState, Conversation } from "../types/chat";
import { ConversationList } from "./ConversationList";
import { ChatComposer } from "./ChatComposer";
import { MessageList } from "./MessageList";
import { RouteStatus } from "./RouteStatus";

interface ChatShellProps {
  state: ChatState;
  activeConversation: Conversation | null;
  isReady: boolean;
  onSend: (content: string) => void | Promise<void>;
  onSelectConversation: (id: string) => void;
  onCreateConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onStop: () => void;
  onRetry: () => void | Promise<void>;
}

export function ChatShell({
  state, activeConversation, isReady, onSend, onSelectConversation,
  onCreateConversation, onDeleteConversation, onStop, onRetry,
}: ChatShellProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const closeHistory = () => setHistoryOpen(false);

  return (
    <main className="app-root" aria-label="QQ AI">
      <div className="app-layout">
        <aside className={"sidebar" + (historyOpen ? " sidebar--open" : "")} aria-label="История диалогов">
          <div className="sidebar-brand">
            <div className="brand-mark" aria-hidden="true"><span>Q</span><i /></div>
            <div><strong>QQ AI</strong><small>Ваше пространство идей</small></div>
            <button className="sidebar-close" type="button" aria-label="Закрыть историю" onClick={closeHistory}>×</button>
          </div>
          <ConversationList
            conversations={state.conversations}
            activeConversationId={state.activeConversationId}
            onSelect={(id) => { onSelectConversation(id); closeHistory(); }}
            onCreate={() => { onCreateConversation(); closeHistory(); }}
            onDelete={onDeleteConversation}
          />
        </aside>

        {historyOpen && <button className="drawer-backdrop" type="button" aria-label="Закрыть историю" onClick={closeHistory} />}

        <section className="chat-panel" aria-label="Чат QQ AI">
          <header className="chat-header">
            <button className="history-toggle" type="button" aria-label="Открыть историю диалогов" onClick={() => setHistoryOpen(true)}>
              <span /><span /><span />
            </button>
            <div className="chat-header__identity">
              <h1>QQ AI</h1>
              <p>Спокойное пространство для мыслей</p>
            </div>
            <RouteStatus />
          </header>

          <div className="chat-content">
            {isReady ? (
              <MessageList messages={activeConversation?.messages ?? []} onRetry={() => void onRetry()} />
            ) : (
              <div className="loading-state" role="status"><div className="loading-state__orb" /><span>Открываем ваш чат…</span></div>
            )}
          </div>

          <footer className="chat-footer">
            <ChatComposer onSend={onSend} disabled={!isReady} isGenerating={state.generationId !== null} onStop={onStop} />
            <p className="composer-disclaimer">Ответы сейчас демонстрационные. Настоящая модель ещё не подключена.</p>
          </footer>
        </section>
      </div>
    </main>
  );
}
