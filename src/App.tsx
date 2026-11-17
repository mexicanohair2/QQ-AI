import { useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };
const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
const KEY = "qq-ai-local-chat-v1";
const SYSTEM = "Ты QQ AI — полезный, честный и спокойный ИИ-помощник. Отвечай на языке пользователя. Если не знаешь ответа, прямо скажи об этом. Не выдумывай факты.";

export default function App() {
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(value) ? value.slice(-30) : [];
    } catch { return []; }
  });
  const [status, setStatus] = useState("Модель ещё не загружена");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const engine = useRef<any>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(messages.slice(-30))); } catch { /* storage may be unavailable */ }
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function loadModel() {
    if (busy || ready) return;
    setBusy(true); setError(""); setStatus("Проверяем поддержку WebGPU…");
    try {
      if (!("gpu" in navigator)) throw new Error("Этот браузер не предоставляет WebGPU. Локальная модель пока не поддерживается в нём.");
      setStatus("Загружаем Qwen 0.5B. Первый запуск потребует около 1 ГБ свободной памяти и загрузки модели.");
      const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
      const created = await CreateMLCEngine(MODEL_ID, {
        initProgressCallback: (report: { progress: number; text: string }) => {
          setProgress(Math.max(0, Math.min(100, Math.round(report.progress * 100))));
          setStatus(report.text || "Подготавливаем модель…");
        },
      });
      engine.current = created;
      setReady(true); setStatus("QQ AI готов к диалогу");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить модель.");
      setStatus("Модель не запущена");
    } finally { setBusy(false); }
  }

  async function send() {
    const content = draft.trim();
    if (!content || busy || !ready || !engine.current) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setDraft(""); setBusy(true); setError(""); setStatus("QQ AI думает…");
    try {
      const stream = await engine.current.chat.completions.create({
        messages: [{ role: "system", content: SYSTEM }, ...next],
        temperature: 0.7,
        max_tokens: 500,
        stream: true,
      });
      let answer = "";
      for await (const chunk of stream) {
        answer += chunk.choices?.[0]?.delta?.content || "";
        setMessages([...next, { role: "assistant", content: answer }]);
      }
      if (!answer.trim()) throw new Error("Модель вернула пустой ответ. Попробуй ещё раз.");
      setStatus("Ответ создан локально на этом устройстве");
    } catch (e) {
      setMessages(next);
      setError(e instanceof Error ? e.message : "Ошибка генерации ответа.");
      setStatus("Не удалось получить ответ");
    } finally { setBusy(false); }
  }

  function clearChat() {
    if (busy) return;
    setMessages([]);
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  }

  return <main className="app">
    <header className="topbar">
      <div className="brand"><div className="orb">QQ</div><div><strong>QQ AI</strong><span>Личный ИИ-помощник</span></div></div>
      <button className="clear" onClick={clearChat} disabled={busy || messages.length === 0}>Очистить</button>
    </header>
    <section className="chat" aria-label="Диалог с QQ AI">
      {messages.length === 0 && <div className="welcome">
        <div className="welcome-orb">QQ</div>
        <h1>Начнём диалог</h1>
        <p>Это первая версия QQ AI. Ответы генерируются настоящей языковой моделью Qwen прямо на устройстве — без отправки переписки на сервер.</p>
        {!ready && <button className="primary" onClick={loadModel} disabled={busy}>{busy ? "Подготовка модели…" : "Загрузить ИИ-модель"}</button>}
        {busy && <div className="progress"><div style={{ width: progress + "%" }} /></div>}
        <small>{status}</small>
      </div>}
      {messages.map((m, i) => <article className={`message ${m.role}`} key={i}>
        <div className="sender">{m.role === "user" ? "Вы" : "QQ AI"}</div>
        <div className="bubble">{m.content || (busy ? <span className="dots">Печатает…</span> : "")}</div>
      </article>)}
      <div ref={bottom} />
    </section>
    {error && <div className="error" role="alert">{error}</div>}
    <footer className="composer-wrap">
      <div className="model-line"><span className={ready ? "dot online" : "dot"} />{status}</div>
      {!ready && messages.length > 0 && <button className="load-inline" onClick={loadModel} disabled={busy}>Загрузить модель</button>}
      <form className="composer" onSubmit={e => { e.preventDefault(); void send(); }}>
        <textarea value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder={ready ? "Напиши сообщение…" : "Сначала загрузи модель"} rows={1} disabled={!ready || busy} />
        <button className="send" type="submit" disabled={!ready || busy || !draft.trim()} aria-label="Отправить">↑</button>
      </form>
      <small className="privacy">Локальный режим · Qwen 0.5B · переписка остаётся в браузере</small>
    </footer>
  </main>;
}