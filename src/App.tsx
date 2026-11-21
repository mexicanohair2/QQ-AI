import { useEffect, useMemo, useRef, useState } from "react";

type Message = { id: string; role: "user" | "assistant"; content: string };
type Chat = { id: string; title: string; messages: Message[]; updatedAt: number };
const KEY = "qq-ai.chats.v1";
const id = () => crypto.randomUUID();
const initial = (): Chat => ({ id: id(), title: "Новый диалог", messages: [], updatedAt: Date.now() });

function load(): Chat[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "null");
    if (Array.isArray(value)) {
      const valid = value.filter((c: any) => c && typeof c.id === "string" && Array.isArray(c.messages));
      if (valid.length) return valid;
    }
  } catch { /* Recover to a clean chat if storage is unavailable or malformed. */ }
  return [initial()];
}

function Mark({ small = false }: { small?: boolean }) {
  return <span className={small ? "mark mark-small" : "mark"}>Q</span>;
}

export default function App() {
  const [chats, setChats] = useState<Chat[]>(load);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const active = useMemo(() => chats.find(c => c.id === activeId) || chats[0], [chats, activeId]);

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(chats)); } catch { /* Storage is optional. */ } }, [chats]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [active?.messages, busy]);

  function newChat() {
    const chat = initial();
    setChats(prev => [chat, ...prev]);
    setActiveId(chat.id);
    setMenu(false);
    setError("");
    textarea.current?.focus();
  }

  function deleteChat(chatId: string) {
    const next = chats.filter(c => c.id !== chatId);
    const safe = next.length ? next : [initial()];
    setChats(safe);
    if (activeId === chatId) setActiveId(safe[0].id);
  }

  async function send(text = input) {
    const content = text.trim();
    if (!content || busy || !active) return;
    const user: Message = { id: id(), role: "user", content };
    const history = [...active.messages, user];
    setChats(prev => prev.map(c => c.id === active.id ? { ...c, title: c.messages.length ? c.title : content.slice(0, 42), messages: history, updatedAt: Date.now() } : c));
    setInput("");
    setError("");
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.map(m => ({ role: m.role, content: m.content })) }),
        signal: controller.signal
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Не удалось получить ответ.");
      }
      if (!response.body) throw new Error("Браузер не поддерживает потоковый ответ.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      const assistantId = id();
      const consume = (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === "[DONE]") continue;
          try {
            const event = JSON.parse(raw);
            const delta = event.choices?.[0]?.delta?.content;
            if (typeof delta === "string") answer += delta;
          } catch { /* Ignore non-JSON keepalive frames. */ }
        }
        if (answer) setChats(prev => prev.map(c => c.id === active.id ? { ...c, messages: [...history, { id: assistantId, role: "assistant", content: answer }], updatedAt: Date.now() } : c));
      };
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        consume(decoder.decode(part.value, { stream: true }));
      }
      consume(decoder.decode());
      if (!answer.trim()) throw new Error("Модель завершила запрос без текста. Попробуй ещё раз.");
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : "Неизвестная ошибка.");
    } finally {
      setBusy(false);
      abort.current = null;
      textarea.current?.focus();
    }
  }

  function stop() { abort.current?.abort(); setBusy(false); }

  return <div className="layout">
    {menu && <button className="scrim" aria-label="Закрыть меню" onClick={() => setMenu(false)} />}
    <aside className={"sidebar" + (menu ? " sidebar-open" : "")}>
      <div className="brand"><Mark /><div><b>QQ AI</b><small>Ваш интеллектуальный помощник</small></div></div>
      <button className="new-chat" onClick={newChat}><span>＋</span> Новый диалог</button>
      <div className="section-label">ИСТОРИЯ</div>
      <div className="history">{chats.map(chat => <div className={"history-item" + (chat.id === active?.id ? " active" : "")} key={chat.id}>
        <button className="history-name" onClick={() => { setActiveId(chat.id); setMenu(false); }}>{chat.title}</button>
        <button className="delete" aria-label="Удалить диалог" onClick={() => deleteChat(chat.id)}>×</button>
      </div>)}</div>
      <div className="account"><Mark small /><div><b>QQ AI</b><small>Онлайн-версия</small></div><i /></div>
    </aside>
    <main className="main">
      <header className="topbar">
        <button className="menu-button" onClick={() => setMenu(true)} aria-label="Открыть историю">☰</button>
        <div className="top-brand"><Mark small /><b>QQ AI</b><span>ONLINE</span></div>
        <div className="server-state"><i /> Серверная модель</div>
      </header>
      <section className={"conversation" + (active?.messages.length ? " with-messages" : "")}>
        {active?.messages.length ? <div className="messages">
          {active.messages.map(m => <article className={"message " + m.role} key={m.id}>
            {m.role === "assistant" && <Mark small />}
            <div className="message-body"><label>{m.role === "assistant" ? "QQ AI" : "Вы"}</label><div className="message-text">{m.content}</div></div>
          </article>)}
          {busy && <div className="typing"><Mark small /><span><i /><i /><i /></span></div>}
          <div ref={end} />
        </div> : <div className="welcome">
          <div className="hero-orb"><Mark /></div>
          <div className="eyebrow"><i /> ИНТЕЛЛЕКТУАЛЬНЫЙ ПОМОЩНИК</div>
          <h1>С чего начнём?</h1>
          <p>Задайте вопрос, поделитесь идеей или поставьте задачу.<br />Разберёмся вместе.</p>
          <div className="suggestions">
            <button onClick={() => { setInput("Объясни сложную тему простыми словами и с примерами."); textarea.current?.focus(); }}>✧ <span>Объясни сложную тему</span><b>↗</b></button>
            <button onClick={() => { setInput("Помоги развить мою идею и составить план действий."); textarea.current?.focus(); }}>◇ <span>Помоги с идеей</span><b>↗</b></button>
            <button onClick={() => { setInput("Помоги написать или улучшить текст."); textarea.current?.focus(); }}>▤ <span>Напиши или улучши текст</span><b>↗</b></button>
          </div>
        </div>}
      </section>
      <div className="composer-area">
        {error && <div className="error"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
        <form className="composer" onSubmit={e => { e.preventDefault(); void send(); }}>
          <textarea ref={textarea} rows={1} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Напишите сообщение..." aria-label="Сообщение" />
          <div className="composer-bottom"><span>Enter — отправить · Shift + Enter — новая строка</span>
            {busy ? <button type="button" className="send stop" onClick={stop} aria-label="Остановить">■</button> : <button type="submit" className="send" disabled={!input.trim()} aria-label="Отправить">↑</button>}
          </div>
        </form>
        <p className="disclaimer">QQ AI может ошибаться. Проверяйте важную информацию.</p>
      </div>
    </main>
  </div>;
}
