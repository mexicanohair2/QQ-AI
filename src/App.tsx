import { useEffect, useMemo, useRef, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";

type Message = { role: "user" | "assistant"; content: string };
type Mode = "online" | "offline";
const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
const CHAT_KEY = "qq-ai-chat-v2";
const THREAD_KEY = "qq-ai-thread-v1";
const SYSTEM = "Ты QQ AI — полезный, честный и спокойный ИИ-помощник. Отвечай на языке пользователя. Если не знаешь ответа, прямо скажи об этом. Не выдумывай факты.";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function readMessages(): Message[] {
  try {
    const value = JSON.parse(localStorage.getItem(CHAT_KEY) || "[]");
    return Array.isArray(value) ? value.slice(-40) : [];
  } catch { return []; }
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>(readMessages);
  const [mode, setMode] = useState<Mode>("online");
  const [status, setStatus] = useState("Онлайн-режим");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [memories, setMemories] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(() => {
    try { return localStorage.getItem("qq-ai-sidebar-hidden") !== "1"; }
    catch { return true; }
  });
  const [threads, setThreads] = useState<Array<{id:string;title:string;updated_at:string}>>([]);
  const [cloudStatus, setCloudStatus] = useState("Только на этом устройстве");
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [threadId, setThreadId] = useState(() => {
    try { return localStorage.getItem(THREAD_KEY) || crypto.randomUUID(); }
    catch { return "qq-ai-" + Date.now(); }
  });
  const engine = useRef<any>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { localStorage.setItem("qq-ai-sidebar-hidden", sidebarVisible ? "0" : "1"); }
    catch { /* local storage may be unavailable */ }
  }, [sidebarVisible]);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-40)));
      localStorage.setItem(THREAD_KEY, threadId);
    } catch { /* local storage may be unavailable */ }
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, threadId]);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setSession(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!supabase || !session?.user) {
      setCloudLoaded(false);
      setCloudStatus("Только на этом устройстве");
      setMemoryEnabled(false);
      setMemories([]);
      return;
    }
    let alive = true;
    setCloudLoaded(false);
    setCloudStatus("Подключаем облако…");
    Promise.all([
      supabase.from("qq_ai_threads").select("id,messages").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("qq_ai_preferences").select("memory_enabled,learned_preferences").eq("user_id", session.user.id).maybeSingle(),
    ]).then(([threadResult, prefsResult]) => {
      if (!alive) return;
      if (threadResult.data?.messages && Array.isArray(threadResult.data.messages)) {
        const cloudMessages = threadResult.data.messages as Message[];
        if (cloudMessages.length) {
          setMessages(cloudMessages.slice(-40));
          setThreadId(threadResult.data.id);
        }
      }
      if (prefsResult.data) {
        setMemoryEnabled(Boolean(prefsResult.data.memory_enabled));
        setMemories(Array.isArray(prefsResult.data.learned_preferences) ? prefsResult.data.learned_preferences : []);
      }
      setCloudStatus("Облако подключено");
      if (threadResult.error || prefsResult.error) setCloudStatus("Облако подключено частично");
      setCloudLoaded(true);
    }).catch(() => { setCloudStatus("Не удалось подключить облако"); setCloudLoaded(true); });
    return () => { alive = false; };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!supabase || !session?.user || !cloudLoaded || messages.length === 0) return;
    const timeout = window.setTimeout(async () => {
      const first = messages.find(m => m.role === "user")?.content || "Новый диалог";
      const { error: saveError } = await supabase.from("qq_ai_threads").upsert({
        id: threadId,
        user_id: session.user.id,
        title: first.slice(0, 72),
        messages: messages.slice(-40),
        updated_at: new Date().toISOString(),
      });
      setCloudStatus(saveError ? "Ошибка синхронизации" : "Облако синхронизировано");
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [messages, session?.user?.id, threadId, cloudLoaded]);

  async function loadOfflineModel() {
    if (busy || offlineReady) return;
    setBusy(true); setError(""); setProgress(0); setStatus("Проверяем поддержку WebGPU…");
    try {
      if (!("gpu" in navigator)) throw new Error("В этом браузере нет WebGPU. Для офлайн-модели нужен совместимый браузер.");
      setStatus("Проверяем локальное хранилище модели…");
      const { CreateMLCEngine, prebuiltAppConfig } = await import("@mlc-ai/web-llm");
      const appConfig = { ...prebuiltAppConfig, cacheBackend: "indexeddb" as const };
      const created = await CreateMLCEngine(MODEL_ID, {
        appConfig,
        initProgressCallback: (report: { progress: number; text: string }) => {
          setProgress(Math.max(0, Math.min(100, Math.round(report.progress * 100))));
          setStatus(report.text || "Подготавливаем офлайн-модель…");
        },
      });
      engine.current = created;
      setOfflineReady(true);
      setStatus("Офлайн-модель готова и сохранена в браузере");
      try { await navigator.storage?.persist?.(); } catch { /* best effort */ }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Не удалось подготовить офлайн-модель.";
      let storageHint = "";
      try {
        const estimate = await navigator.storage?.estimate?.();
        if (estimate?.quota && estimate?.usage !== undefined) {
          const freeMb = Math.max(0, Math.round((estimate.quota - estimate.usage) / 1024 / 1024));
          storageHint = ` Свободный лимит хранилища браузера: примерно ${freeMb} МБ.`;
        }
      } catch { /* optional */ }
      setError(message + storageHint + " Проверь свободное место и подключение к Wi‑Fi, затем повтори.");
      setStatus("Офлайн-модель не готова");
    } finally { setBusy(false); }
  }

  async function sendOnline(history: Message[]) {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "system", content: SYSTEM + (memoryEnabled && memories.length ? "\nПользователь разрешил учитывать эти предпочтения: " + memories.join("; ") : "") }, ...history],
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Облачный ИИ вернул ошибку ${response.status}.`);
    }
    if (!response.body) throw new Error("Сервер не вернул поток ответа.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let answer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const event = JSON.parse(payload);
          answer += event.choices?.[0]?.delta?.content || "";
          setMessages([...history, { role: "assistant", content: answer }]);
        } catch { /* ignore incomplete/non-JSON SSE frames */ }
      }
    }
    if (!answer.trim()) throw new Error("Облачная модель вернула пустой ответ.");
    return answer;
  }

  async function sendOffline(history: Message[]) {
    if (!engine.current || !offlineReady) throw new Error("Офлайн-модель ещё не загружена. Подготовь её заранее при подключении к интернету.");
    const stream = await engine.current.chat.completions.create({
      messages: [{ role: "system", content: SYSTEM + (memoryEnabled && memories.length ? "\nУчитывай предпочтения пользователя: " + memories.join("; ") : "") }, ...history],
      temperature: 0.7, max_tokens: 700, stream: true,
    });
    let answer = "";
    for await (const chunk of stream) {
      answer += chunk.choices?.[0]?.delta?.content || "";
      setMessages([...history, { role: "assistant", content: answer }]);
    }
    if (!answer.trim()) throw new Error("Офлайн-модель вернула пустой ответ.");
    return answer;
  }

  async function send() {
    const content = draft.trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setDraft(""); setBusy(true); setError("");
    setStatus(mode === "online" ? "QQ AI подключается к облачной модели…" : "QQ AI думает локально…");
    try {
      if (mode === "online") await sendOnline(next);
      else await sendOffline(next);
      setStatus(mode === "online" ? "Ответ получен от облачной модели" : "Ответ создан на устройстве");
    } catch (e) {
      setMessages(next);
      setError(e instanceof Error ? e.message : "Не удалось получить ответ.");
      setStatus("Не удалось получить ответ");
    } finally { setBusy(false); }
  }

  async function signIn() {
    if (!supabase) { setAuthMessage("Облачная база ещё не настроена."); return; }
    if (!email.includes("@")) { setAuthMessage("Введи корректный адрес электронной почты."); return; }
    setAuthMessage("Отправляем ссылку для входа…");
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
    });
    if (authError) setAuthMessage(authError.message);
    else { setOtpSent(true); setAuthMessage("Проверь почту: открой ссылку для входа или введи код, если письмо пришло с кодом."); }
  }

  async function verifyEmailCode() {
    if (!supabase || !email.trim() || otpCode.trim().length < 6) { setAuthMessage("Введи код из письма."); return; }
    setAuthMessage("Проверяем код…");
    const { error: verifyError } = await supabase.auth.verifyOtp({ email: email.trim(), token: otpCode.trim(), type: "email" });
    setAuthMessage(verifyError ? verifyError.message : "Вход выполнен.");
    if (!verifyError) { setAuthOpen(false); setOtpSent(false); setOtpCode(""); }
  }

  async function saveMemory() {
    const value = memoryDraft.trim();
    if (!value) return;
    const next = [...memories, value].slice(-20);
    setMemories(next); setMemoryDraft("");
    if (supabase && session?.user) {
      const { error: saveError } = await supabase.from("qq_ai_preferences").upsert({
        user_id: session.user.id, memory_enabled: memoryEnabled, learned_preferences: next, updated_at: new Date().toISOString(),
      });
      if (saveError) setError("Не удалось сохранить память в облако: " + saveError.message);
    }
  }

  async function toggleMemory(enabled: boolean) {
    setMemoryEnabled(enabled);
    if (supabase && session?.user) {
      const { error: saveError } = await supabase.from("qq_ai_preferences").upsert({
        user_id: session.user.id, memory_enabled: enabled, learned_preferences: memories, updated_at: new Date().toISOString(),
      });
      if (saveError) setError("Не удалось обновить настройки памяти: " + saveError.message);
    }
  }

  async function rateAnswer(rating: 1 | -1) {
    if (!supabase || !session?.user) {
      setError("Чтобы сохранять оценки ответов в облаке, сначала войди в QQ AI.");
      return;
    }
    const { error: feedbackError } = await supabase.from("qq_ai_feedback").insert({
      user_id: session.user.id, thread_id: threadId, rating,
    });
    if (feedbackError) setError("Не удалось сохранить оценку: " + feedbackError.message);
  }

  async function showHistory() {
    if (!supabase || !session?.user) { setAuthOpen(true); return; }
    const { data, error: historyError } = await supabase.from("qq_ai_threads").select("id,title,updated_at").order("updated_at", { ascending: false }).limit(30);
    if (historyError) { setError("Не удалось загрузить историю: " + historyError.message); return; }
    setThreads(data || []); setSidebarVisible(true);
  }

  async function openThread(id: string) {
    if (!supabase) return;
    const { data, error: threadError } = await supabase.from("qq_ai_threads").select("id,messages").eq("id", id).single();
    if (threadError) { setError("Не удалось открыть диалог: " + threadError.message); return; }
    setThreadId(data.id); setMessages(Array.isArray(data.messages) ? data.messages as Message[] : []);
  }

  function newChat() {
    if (busy) return;
    setMessages([]);
    setThreadId(crypto.randomUUID());
    setError("");
  }

  const modeLabel = useMemo(() => mode === "online" ? "Онлайн" : "Офлайн", [mode]);

  return <main className="shell">
    {sidebarVisible && <aside className="rail history-sidebar">
      <div className="sidebar-head">
        <button className="brand-mark" aria-label="QQ AI">QQ</button>
        <button className="sidebar-close" onClick={() => setSidebarVisible(false)} aria-label="Скрыть историю" title="Скрыть панель">‹</button>
      </div>
      <button className="sidebar-new-chat" onClick={newChat}><span>＋</span>Новый диалог</button>
      <div className="sidebar-section-label">ИСТОРИЯ ДИАЛОГОВ</div>
      <div className="sidebar-history-list">
        {!session ? <div className="sidebar-empty">Войди в аккаунт, чтобы увидеть сохранённые диалоги.</div> :
          threads.length ? threads.map(t => <button className="sidebar-thread" key={t.id} onClick={() => void openThread(t.id)}><b>{t.title || "Новый диалог"}</b><small>{new Date(t.updated_at).toLocaleDateString("ru-RU")}</small></button>) :
          <div className="sidebar-empty">Здесь появятся твои сохранённые диалоги.</div>}
      </div>
      <div className="sidebar-bottom">
        <button className="sidebar-settings" onClick={() => setSettingsOpen(true)}>✧ <span>Настройки памяти</span></button>
        <button className="avatar-button" title={session?.user.email || "Войти"} onClick={() => setAuthOpen(true)}>{session?.user.email?.[0]?.toUpperCase() || "↗"}</button>
      </div>
    </aside>}

    <section className="workspace">
      <header className="topbar">
        <div className="top-leading"><button className="sidebar-toggle" onClick={() => setSidebarVisible(v => !v)} aria-label={sidebarVisible ? "Скрыть боковую панель" : "Показать боковую панель"} title={sidebarVisible ? "Скрыть боковую панель" : "Показать боковую панель"}>{sidebarVisible ? "‹" : "☰"}</button><div className="top-brand"><span className="brand-orb">QQ</span><div><strong>QQ AI</strong><small>Ваше пространство для идей</small></div></div></div>
        <div className="top-actions">
          <button className="history-open-button" onClick={() => void showHistory()}>История</button>
          <button className="cloud-pill" onClick={() => setAuthOpen(true)}><span className={session ? "cloud-dot connected" : "cloud-dot"} />{session ? "Облако" : "Синхронизация"}</button>
          <div className="mode-switch" aria-label="Режим работы">
            <button className={mode === "online" ? "selected" : ""} onClick={() => { setMode("online"); setError(""); setStatus("Онлайн-режим"); }}>Онлайн</button>
            <button className={mode === "offline" ? "selected" : ""} onClick={() => { setMode("offline"); setError(""); setStatus(offlineReady ? "Офлайн-модель готова" : "Сначала подготовь офлайн-модель"); }}>Офлайн</button>
          </div>
          <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Настройки">⚙</button>
        </div>
      </header>

      <div className="content">
        {messages.length === 0 ? <div className="welcome">
          <div className="welcome-orb"><span>QQ</span><i /></div>
          <div className="eyebrow">ЛИЧНЫЙ ИИ-ПОМОЩНИК</div>
          <h1>О чём <em>подумаем</em> сегодня?</h1>
          <p className="welcome-copy">Задавай вопросы, исследуй идеи и создавай новое. Переключайся между облачным интеллектом и локальной моделью.</p>
          <div className="suggestions">
            <button onClick={() => setDraft("Помоги мне разобраться в новой теме и составь понятный план изучения.")}><span>✦</span><b>Разобраться в теме</b><small>Объяснение простыми словами</small></button>
            <button onClick={() => setDraft("Помоги придумать и развить интересную идею.")}><span>⌁</span><b>Развить идею</b><small>От задумки до плана</small></button>
            <button onClick={() => setDraft("Помоги написать или улучшить текст.")}><span>✎</span><b>Работа с текстом</b><small>Написание и редактура</small></button>
          </div>
          {mode === "offline" && !offlineReady && <div className="offline-card">
            <div><b>Подготовить офлайн-модель</b><small>Первое скачивание Qwen — около 1 ГБ. Загрузи её по Wi‑Fi один раз; затем она будет доступна без интернета.</small></div>
            <button className="primary" onClick={loadOfflineModel} disabled={busy}>{busy ? "Загрузка…" : "Загрузить модель"}</button>
            {busy && <div className="progress"><span style={{ width: progress + "%" }} /></div>}
          </div>}
          <div className="welcome-foot"><span className="status-pulse" />{mode === "online" ? "Облачный режим · ответы через интернет" : offlineReady ? "Локальная модель готова" : "Офлайн-модель ещё не загружена"}</div>
        </div> : <div className="conversation">
          {messages.map((m, i) => <article className={`message ${m.role}`} key={i}>
            <div className="message-avatar">{m.role === "assistant" ? <span>QQ</span> : "Вы"}</div>
            <div className="message-body"><div className="sender">{m.role === "assistant" ? "QQ AI" : "Вы"}</div>
              <div className="bubble">{m.content || (busy ? <span className="typing"><i/><i/><i/></span> : "")}</div>
              {m.role === "assistant" && m.content && <div className="feedback"><button title="Полезный ответ" onClick={() => void rateAnswer(1)}>↑</button><button title="Неудачный ответ" onClick={() => void rateAnswer(-1)}>↓</button><small>Оценить ответ</small></div>}
            </div>
          </article>)}
          <div ref={bottom} />
        </div>}
      </div>

      {error && <div className="error-banner">{error}</div>}
      {mode === "offline" && !offlineReady && messages.length > 0 && <div className="offline-inline"><span>Офлайн-модель не загружена</span><button onClick={loadOfflineModel} disabled={busy}>Подготовить</button>{busy && <span>{progress}%</span>}</div>}
      <footer className="composer-area">
        <div className="composer">
          <textarea value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder={mode === "online" ? "Спросите о чём угодно…" : offlineReady ? "Сообщение для локальной модели…" : "Сначала подготовьте офлайн-модель"} rows={1} disabled={busy || (mode === "offline" && !offlineReady)} />
          <button className="send-button" onClick={() => void send()} disabled={!draft.trim() || busy || (mode === "offline" && !offlineReady)} aria-label="Отправить"><span>↑</span></button>
        </div>
        <div className="composer-meta"><span>{status}</span><span>{modeLabel} · {mode === "offline" ? "Qwen 0.5B" : "Cerebras GLM 4.7 · облачная модель"}</span></div>
      </footer>
    </section>

    {authOpen && <div className="modal-backdrop" onClick={() => setAuthOpen(false)}><section className="modal" onClick={e => e.stopPropagation()}>
      <button className="modal-close" onClick={() => setAuthOpen(false)}>×</button><div className="modal-symbol">QQ</div><h2>{session ? "Аккаунт QQ AI" : "Синхронизация с облаком"}</h2>
      {session ? <><p>Вход выполнен: {session.user.email}. История и память синхронизируются с облаком.</p><button className="secondary-button" onClick={async () => { await supabase?.auth.signOut(); setAuthOpen(false); }}>Выйти</button></> :
      <><p>Войди по электронной почте, чтобы сохранять диалоги и настройки между устройствами.</p><input className="modal-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Электронная почта" disabled={otpSent} />{otpSent ? <><input className="modal-input" inputMode="numeric" value={otpCode} onChange={e => setOtpCode(e.target.value)} placeholder="Код из письма" /><button className="primary full" onClick={() => void verifyEmailCode()}>Подтвердить код</button><button className="secondary-button full" onClick={() => { setOtpSent(false); setOtpCode(""); setAuthMessage(""); }}>Изменить почту</button></> : <button className="primary full" onClick={() => void signIn()}>Получить код для входа</button>}<small>{authMessage}</small></>}
    </section></div>}

    {settingsOpen && <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}><section className="modal settings-modal" onClick={e => e.stopPropagation()}>
      <button className="modal-close" onClick={() => setSettingsOpen(false)}>×</button><div className="eyebrow">ПЕРСОНАЛИЗАЦИЯ</div><h2>Память QQ AI</h2>
      <p>Память выключена по умолчанию. Если включить её, QQ AI сможет учитывать только те предпочтения, которые ты сам добавишь.</p>
      <label className="toggle-row"><span><b>Использовать память</b><small>Учитывать сохранённые предпочтения в ответах</small></span><input type="checkbox" checked={memoryEnabled} onChange={e => void toggleMemory(e.target.checked)} /></label>
      <div className="memory-entry"><input className="modal-input" value={memoryDraft} onChange={e => setMemoryDraft(e.target.value)} placeholder="Например: объясняй коротко и с примерами" /><button className="secondary-button" onClick={() => void saveMemory()}>Добавить</button></div>
      {memories.length > 0 && <ul className="memory-list">{memories.map((m, i) => <li key={i}>{m}<button onClick={async () => { const next = memories.filter((_, j) => j !== i); setMemories(next); if (supabase && session?.user) await supabase.from("qq_ai_preferences").upsert({ user_id: session.user.id, memory_enabled: memoryEnabled, learned_preferences: next, updated_at: new Date().toISOString() }); }}>Удалить</button></li>)}</ul>}
      <div className="cloud-line">{cloudStatus}</div>
    </section></div>}
  </main>;
}