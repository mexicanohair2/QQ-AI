import { lazy, Suspense, useEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";
const MarkdownMessage = lazy(() => import("./components/MarkdownMessage"));
import { createClient, type Session } from "@supabase/supabase-js";
import { calculateMathQuestion } from "./lib/math";
import { dataUrlToBase64, prepareImage, sampleVideoFrames } from "./lib/media";
import { buildSearchContext, shouldSearchWeb, type QQSearchSource } from "./lib/qq-ai-core";
import { readOpenAIChatStream } from "./lib/openai-stream";
import { readChatMessages, persistChatMessages, readChatThreadId, persistChatThreadId, type ChatMessage } from "./lib/chat-storage";
import { buildMemoryInstruction, normalizeMemoryEntries, readStoredMemories, persistStoredMemories, readStoredMemoryPreference, resolveMemoryEnabled, persistStoredMemoryEnabled, MAX_MEMORY_CHARS } from "./lib/user-memory";
import { canAttachMedia, selectVisionBackend, selectLocalVideoFrames } from "./lib/vision-routing";
import { appendTranscript, resampleTo16kMono, SPEECH_SAMPLE_RATE, MAX_LOCAL_SPEECH_SECONDS } from "./lib/local-audio";
import { getOtherLocalRuntimes, type LocalRuntime } from "./lib/local-runtime";

type Message = ChatMessage;
type MediaAttachment = { id: string; file: File; name: string; kind: "image" | "video"; previewUrl: string };
type Mode = "online" | "offline";
const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
const SYSTEM = `Ты QQ AI — полезный, честный и спокойный ИИ-помощник. Отвечай на языке пользователя. Если не знаешь ответа, прямо скажи об этом. Не выдумывай факты.\n\nФОРМАТ ОТВЕТОВ:\n- Используй Markdown: короткие жирные заголовки, абзацы, списки и таблицы, когда они действительно улучшают читаемость.\n- Ссылки оформляй как [понятный текст](https://...). Не создавай вымышленные ссылки.\n- В математике показывай понятные шаги и записывай формулы через LaTeX: $...$ внутри строки и $...$ отдельным блоком.\n- В конце математического решения выделяй итог одной строкой в формате ==Ответ: ...==; для уравнений по возможности используй \\boxed{...}.\n- Не называй ответ правильным, если вычисления не проверены. После решения проверь подстановкой или обратным вычислением, когда это возможно.\n- Завершай выполненную задачу ясным результатом, не продолжай работу без необходимости.`;
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function VoiceIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18v3" />
      <path d="M8.5 21h7" />
    </svg>
  );
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>(() => readChatMessages(undefined, "anonymous"));
  const [mode, setMode] = useState<Mode>("offline");
  const [status, setStatus] = useState("Локальная модель ещё не загружена");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notifyOnComplete, setNotifyOnComplete] = useState(() => {
    try { return localStorage.getItem("qq-ai-notify-complete") === "1"; }
    catch { return false; }
  });
  const [offlineReady, setOfflineReady] = useState(false);
  const [onlineModelReady, setOnlineModelReady] = useState<boolean | null>(null);
  const [visionReady, setVisionReady] = useState<boolean | null>(null);
  const [localVisionReady, setLocalVisionReady] = useState(false);
  const [localVisionLoading, setLocalVisionLoading] = useState(false);
  const [localVisionProgress, setLocalVisionProgress] = useState(0);
  const [localVisionStatus, setLocalVisionStatus] = useState("");
  const localVisionWorkerRef = useRef<Worker | null>(null);
  const localVisionLoadPromiseRef = useRef<{ resolve: () => void; reject: (error: Error) => void } | null>(null);
  const localVisionRequestRef = useRef<{ id: string; resolve: (answer: string) => void; reject: (error: Error) => void } | null>(null);
  const [capabilitiesUnavailable, setCapabilitiesUnavailable] = useState(false);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<MediaAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [authLoaded, setAuthLoaded] = useState(!supabase);
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [voiceNoticeOpen, setVoiceNoticeOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakingMessageIndex, setSpeakingMessageIndex] = useState<number | null>(null);
  const speechRunRef = useRef(0);
  const recognitionRef = useRef<any>(null);
  const [localSpeechReady, setLocalSpeechReady] = useState(false);
  const [localSpeechLoading, setLocalSpeechLoading] = useState(false);
  const [localSpeechProgress, setLocalSpeechProgress] = useState(0);
  const [localSpeechStatus, setLocalSpeechStatus] = useState("");
  const [localSpeechRecording, setLocalSpeechRecording] = useState(false);
  const [localSpeechTranscribing, setLocalSpeechTranscribing] = useState(false);
  const localSpeechWorkerRef = useRef<Worker | null>(null);
  const localSpeechLoadPromiseRef = useRef<{ resolve: () => void; reject: (error: Error) => void } | null>(null);
  const localSpeechRequestRef = useRef<{ id: string; resolve: (text: string) => void; reject: (error: Error) => void } | null>(null);
  const localSpeechRecorderRef = useRef<MediaRecorder | null>(null);
  const localSpeechStreamRef = useRef<MediaStream | null>(null);
  const localSpeechChunksRef = useRef<BlobPart[]>([]);
  const localSpeechStopTimerRef = useRef<number | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [memoryEnabled, setMemoryEnabled] = useState(() => readStoredMemoryPreference(undefined, session?.user?.id ?? "anonymous")?.enabled ?? false);
  const memoryPersistenceReadyRef = useRef(false);
  const memoryPersistenceScopeRef = useRef(session?.user?.id ?? "anonymous");
  const [memoryDraft, setMemoryDraft] = useState("");
  const [memories, setMemories] = useState<string[]>(() => readStoredMemories(undefined, session?.user?.id ?? "anonymous"));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(() => {
    try { return localStorage.getItem("qq-ai-sidebar-hidden") !== "1"; }
    catch { return true; }
  });
  const [threads, setThreads] = useState<Array<{id:string;title:string;updated_at:string}>>([]);
  const [cloudStatus, setCloudStatus] = useState("Только на этом устройстве");
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [threadId, setThreadId] = useState(() =>
    readChatThreadId(undefined, "anonymous") || crypto.randomUUID()
  );
  const chatPersistenceReadyRef = useRef(false);
  const chatPersistenceScopeRef = useRef("anonymous");
  const engine = useRef<any>(null);

  function releaseLocalVisionWorker() {
    localVisionLoadPromiseRef.current?.reject(new Error("Локальный Vision выгружен для освобождения памяти."));
    localVisionRequestRef.current?.reject(new Error("Локальный Vision выгружен для освобождения памяти."));
    localVisionLoadPromiseRef.current = null;
    localVisionRequestRef.current = null;
    localVisionWorkerRef.current?.terminate();
    localVisionWorkerRef.current = null;
    setLocalVisionReady(false);
    setLocalVisionLoading(false);
    setLocalVisionProgress(0);
    setLocalVisionStatus("Модель выгружена для освобождения памяти; загруженные файлы остаются в кэше.");
  }

  function releaseLocalSpeechWorker() {
    if (localSpeechRecorderRef.current && localSpeechRecorderRef.current.state !== "inactive") {
      throw new Error("Сначала останови запись с микрофона.");
    }
    if (localSpeechTranscribing || localSpeechRequestRef.current) {
      throw new Error("Дождись завершения распознавания речи.");
    }
    localSpeechLoadPromiseRef.current?.reject(new Error("Whisper выгружен для освобождения памяти."));
    localSpeechRequestRef.current?.reject(new Error("Whisper выгружен для освобождения памяти."));
    localSpeechLoadPromiseRef.current = null;
    localSpeechRequestRef.current = null;
    localSpeechWorkerRef.current?.terminate();
    localSpeechWorkerRef.current = null;
    setLocalSpeechReady(false);
    setLocalSpeechLoading(false);
    setLocalSpeechProgress(0);
    setLocalSpeechStatus("Модель выгружена для освобождения памяти; загруженные файлы остаются в кэше.");
  }

  async function prepareLocalRuntime(target: LocalRuntime) {
    if (localSpeechRecording || localSpeechTranscribing) {
      throw new Error("Сначала закончи текущую запись или распознавание речи.");
    }
    if (target !== "vision" && localVisionLoading) {
      throw new Error("Дождись завершения загрузки локального Vision.");
    }
    if (target !== "speech" && localSpeechLoading) {
      throw new Error("Дождись завершения загрузки локального распознавания речи.");
    }

    for (const runtime of getOtherLocalRuntimes(target)) {
      if (runtime === "text" && engine.current) {
        const previousEngine = engine.current;
        await previousEngine.unload();
        if (engine.current === previousEngine) engine.current = null;
        setOfflineReady(false);
      } else if (runtime === "vision" && localVisionWorkerRef.current) {
        releaseLocalVisionWorker();
      } else if (runtime === "speech" && localSpeechWorkerRef.current) {
        releaseLocalSpeechWorker();
      }
    }
  }
  const bottom = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  function handleTouchStart(event: ReactTouchEvent<HTMLElement>) {
    const touch = event.touches[0];
    if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLElement>) {
    const start = touchStart.current;
    touchStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch || window.innerWidth > 650) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 65 || Math.abs(dx) < Math.abs(dy) * 1.35) return;

    if (sidebarVisible && start.x <= 285 && dx < 0) {
      setSidebarVisible(false);
    } else if (!sidebarVisible && start.x <= 28 && dx > 0) {
      setSidebarVisible(true);
    }
  }

  useEffect(() => {
    try { localStorage.setItem("qq-ai-sidebar-hidden", sidebarVisible ? "0" : "1"); }
    catch { /* local storage may be unavailable */ }
  }, [sidebarVisible]);

  useEffect(() => {
    const memoryScope = session?.user?.id ?? "anonymous";
    if (!memoryPersistenceReadyRef.current) {
      memoryPersistenceReadyRef.current = true;
      memoryPersistenceScopeRef.current = memoryScope;
      return;
    }
    if (memoryPersistenceScopeRef.current !== memoryScope) {
      memoryPersistenceScopeRef.current = memoryScope;
      return;
    }
    if (session?.user && !cloudLoaded) return;

    persistStoredMemories(memories, undefined, memoryScope);
    persistStoredMemoryEnabled(memoryEnabled, undefined, Date.now(), memoryScope);
  }, [memories, memoryEnabled, session?.user?.id, cloudLoaded]);

  useEffect(() => {
    const chatScope = session?.user?.id ?? "anonymous";
    if (!chatPersistenceReadyRef.current) {
      chatPersistenceReadyRef.current = true;
      chatPersistenceScopeRef.current = chatScope;
      return;
    }
    if (chatPersistenceScopeRef.current !== chatScope) {
      chatPersistenceScopeRef.current = chatScope;
      return;
    }
    if (supabase && !authLoaded) return;
    if (session?.user && !cloudLoaded) return;

    persistChatMessages(messages, undefined, chatScope);
    persistChatThreadId(threadId, undefined, chatScope);
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, threadId, session?.user?.id, authLoaded, cloudLoaded]);

  useEffect(() => {
    let alive = true;
    fetch("/api/capabilities").then(async response => {
      if (!response.ok) throw new Error("Статус QQ AI недоступен");
      return response.json();
    }).then(data => {
      if (!alive) return;
      setOnlineModelReady(data.onlineText?.state === "configured");
      setVisionReady(data.imageUnderstanding?.state === "configured");
      setCapabilitiesUnavailable(false);
    }).catch(() => {
      if (alive) { setOnlineModelReady(null); setVisionReady(null); setCapabilitiesUnavailable(true); }
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) {
        setSession(data.session);
        setAuthLoaded(true);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      setAuthLoaded(true);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setCloudLoaded(false);
      }
      setSession(next);
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!authLoaded) return;
    if (!supabase || !session?.user) {
      setMessages(readChatMessages(undefined, "anonymous"));
      setThreadId(readChatThreadId(undefined, "anonymous") || crypto.randomUUID());
      setCloudLoaded(true);
      setCloudStatus("Только на этом устройстве");
      setMemories(readStoredMemories(undefined, "anonymous"));
      setMemoryEnabled(readStoredMemoryPreference(undefined, "anonymous")?.enabled ?? false);
      return;
    }
    let alive = true;
    setCloudLoaded(false);
    setCloudStatus("Подключаем облако…");
    setMessages(readChatMessages(undefined, session.user.id));
    setThreadId(readChatThreadId(undefined, session.user.id) || crypto.randomUUID());
    setMemories(readStoredMemories(undefined, session.user.id));
    setMemoryEnabled(readStoredMemoryPreference(undefined, session.user.id)?.enabled ?? false);
    Promise.all([
      supabase.from("qq_ai_threads").select("id,messages").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("qq_ai_preferences").select("memory_enabled,learned_preferences,updated_at").eq("user_id", session.user.id).maybeSingle(),
    ]).then(async ([threadResult, prefsResult]) => {
      if (!alive) return;
      if (threadResult.data?.messages && Array.isArray(threadResult.data.messages)) {
        const cloudMessages = threadResult.data.messages as Message[];
        if (cloudMessages.length) {
          setMessages(cloudMessages.slice(-40));
          setThreadId(threadResult.data.id);
        }
      }
      const localMemories = readStoredMemories(undefined, session.user.id);
      const localMemoryPreference = readStoredMemoryPreference(undefined, session.user.id);
      const cloudMemories = normalizeMemoryEntries(prefsResult.data?.learned_preferences);
      const mergedMemories = normalizeMemoryEntries([...localMemories, ...cloudMemories]);
      const cloudUpdatedAt = prefsResult.data?.updated_at
        ? Date.parse(prefsResult.data.updated_at)
        : null;
      const memoryEnabledValue = resolveMemoryEnabled(
        localMemoryPreference,
        prefsResult.data ? Boolean(prefsResult.data.memory_enabled) : null,
        cloudUpdatedAt !== null && Number.isFinite(cloudUpdatedAt) ? cloudUpdatedAt : null,
      );
      setMemoryEnabled(memoryEnabledValue);
      setMemories(mergedMemories);

      setCloudStatus("Облако подключено");
      if (threadResult.error || prefsResult.error) {
        setCloudStatus("Облако подключено частично");
      } else if (prefsResult.data || localMemories.length > 0 || localMemoryPreference !== null) {
        const cloudNeedsUpdate = !prefsResult.data ||
          JSON.stringify(mergedMemories) !== JSON.stringify(cloudMemories) ||
          memoryEnabledValue !== Boolean(prefsResult.data.memory_enabled);
        if (cloudNeedsUpdate) {
          const { error: syncMemoryError } = await supabase.from("qq_ai_preferences").upsert({
            user_id: session.user.id,
            memory_enabled: memoryEnabledValue,
            learned_preferences: mergedMemories,
            updated_at: new Date().toISOString(),
          });
          if (syncMemoryError) setCloudStatus("Облако подключено частично");
        }
      }
      if (!alive) return;
      setCloudLoaded(true);
    }).catch(() => { if (alive) { setCloudStatus("Не удалось подключить облако"); setCloudLoaded(true); } });
    return () => { alive = false; };
  }, [authLoaded, session?.user?.id]);

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
    if (busy || offlineReady || localVisionLoading || localSpeechLoading || localSpeechRecording || localSpeechTranscribing) return;
    setBusy(true); setError(""); setProgress(0); setStatus("Проверяем поддержку WebGPU…");
    try {
      await prepareLocalRuntime("text");
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
      if (!gpu) throw new Error("В этом браузере нет WebGPU. Для локальной модели нужен совместимый браузер.");
      setStatus("Проверяем графический адаптер…");
      const adapter = await gpu.requestAdapter();
      if (!adapter) throw new Error("Браузер не обнаружил совместимый графический адаптер WebGPU. Локальная модель на этом устройстве пока недоступна.");
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


  async function sendSearchFallback(query: string): Promise<string> {
    setStatus("QQ Search ищет актуальные страницы…");
    const response = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "QQ Search временно недоступен.");
    if (typeof result.answer !== "string" || !result.answer.trim()) {
      throw new Error("QQ Search не вернул результатов.");
    }
    return result.answer;
  }

  async function searchWeb() {
    const content = draft.trim();
    if (!content || busy) return;
    if (attachments.length > 0) {
      setError("Сначала отправь или удали вложения, затем запускай отдельный поиск.");
      return;
    }

    const next = [...messages, { role: "user" as const, content }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setDraft("");
    setBusy(true);
    setError("");
    setStatus("QQ Search ищет страницы в интернете…");

    try {
      const answer = await sendSearchFallback(content);
      setMessages([...next, { role: "assistant", content: answer }]);
      setStatus("Поиск завершён");
      await notifyTaskComplete();
    } catch (e) {
      setMessages(next);
      setError(e instanceof Error ? e.message : "Не удалось выполнить поиск.");
      setStatus("Поиск не удался");
    } finally {
      setBusy(false);
    }
  }

  async function sendOnline(history: Message[]) {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "system", content: SYSTEM + (memoryEnabled ? buildMemoryInstruction(memories) : "") }, ...history],
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Облачный ИИ вернул ошибку ${response.status}.`);
    }
    if (!response.body) throw new Error("Сервер не вернул поток ответа.");

    let streamed = "";
    return readOpenAIChatStream(response.body, (token) => {
      streamed += token;
      setMessages([...history, { role: "assistant", content: streamed }]);
    });
  }

  async function sendOffline(history: Message[]) {
    if (!engine.current || !offlineReady) throw new Error("Локальная модель ещё не загружена. Нажми «Загрузить и запустить ИИ» на стартовом экране.");
    const systemMessages: Array<{ role: "system"; content: string }> = [{
      role: "system",
      content: SYSTEM + (memoryEnabled ? buildMemoryInstruction(memories) : ""),
    }];
    const lastUserMessage = [...history].reverse().find(message => message.role === "user")?.content || "";

    if (shouldSearchWeb(lastUserMessage)) {
      setStatus("Ищу актуальные источники перед ответом…");
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12_000);
      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: lastUserMessage }),
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({})) as { sources?: unknown; error?: string };
        const sources = Array.isArray(result.sources) ? result.sources.filter((source): source is QQSearchSource =>
          Boolean(source) &&
          typeof source === "object" &&
          typeof (source as QQSearchSource).title === "string" &&
          typeof (source as QQSearchSource).url === "string" &&
          typeof (source as QQSearchSource).domain === "string" &&
          typeof (source as QQSearchSource).excerpt === "string" &&
          typeof (source as QQSearchSource).retrievedAt === "string"
        ).slice(0, 8) : [];
        if (!response.ok || sources.length === 0) {
          systemMessages.push({
            role: "system",
            content: "Пользователь запросил актуальную информацию, но веб-поиск не вернул проверяемых источников. Не выдавай сведения за актуальные и прямо сообщи об ограничении.",
          });
        } else {
          systemMessages.push({ role: "system", content: buildSearchContext(sources) });
        }
      } catch {
        systemMessages.push({
          role: "system",
          content: "Пользователь запросил актуальную информацию, но веб-поиск не сработал. Не выдумывай источники и предупреди, что не смог проверить актуальность.",
        });
      } finally {
        window.clearTimeout(timeout);
      }
    }

    const stream = await engine.current.chat.completions.create({
      messages: [...systemMessages, ...history],
      temperature: 0.7, max_tokens: 900, stream: true,
    });
    let answer = "";
    for await (const chunk of stream) {
      answer += chunk.choices?.[0]?.delta?.content || "";
      setMessages([...history, { role: "assistant", content: answer }]);
    }
    if (!answer.trim()) throw new Error("Локальная модель вернула пустой ответ.");
    return answer;
  }


  function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!selected.length) return;
    if (!canAttachMedia(mode, visionReady === true, localVisionReady)) {
      setError(mode === "online" && visionReady === null
        ? "Сначала дождись проверки облачного Vision или загрузи локальную модель зрения."
        : "Загрузи локальную модель зрения, чтобы анализировать фото и видео прямо на устройстве.");
      return;
    }
    const videos = selected.filter(file => file.type.startsWith("video/"));
    const images = selected.filter(file => file.type.startsWith("image/"));
    if ((videos.length > 0 && images.length > 0) || videos.length + images.length !== selected.length) {
      setError("Выбери либо изображения, либо одно видео за раз.");
      return;
    }
    const kind: MediaAttachment["kind"] = videos.length ? "video" : "image";
    if (attachments.length && attachments[0].kind !== kind) {
      setError("Сначала отправь или удали уже выбранные вложения.");
      return;
    }
    if (kind === "video" && (videos.length !== 1 || attachments.length > 0)) {
      setError("За один запрос можно прикрепить одно видео.");
      return;
    }
    if (kind === "image" && attachments.length + images.length > 3) {
      setError("Можно прикрепить не более трёх изображений.");
      return;
    }
    const valid = selected.filter(file => {
      if (kind === "image") {
        const supported = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
        if (!supported) setError("Поддерживаются изображения JPEG, PNG и WebP.");
        else if (file.size > 12 * 1024 * 1024) setError("Изображение больше 12 МБ.");
        return supported && file.size <= 12 * 1024 * 1024;
      }
      const supported = ["video/mp4", "video/webm"].includes(file.type);
      if (!supported) setError("Поддерживаются видео MP4 и WebM.");
      else if (file.size > 30 * 1024 * 1024) setError("Видео больше 30 МБ.");
      return supported && file.size <= 30 * 1024 * 1024;
    });
    if (!valid.length) return;
    setAttachments(current => [...current, ...valid.map(file => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      kind,
      previewUrl: URL.createObjectURL(file),
    }))]);
    setError("");
  }

  function removeAttachment(id: string) {
    const item = attachments.find(attachment => attachment.id === id);
    if (item) URL.revokeObjectURL(item.previewUrl);
    setAttachments(current => current.filter(attachment => attachment.id !== id));
  }

  async function sendVision(history: Message[], selected: MediaAttachment[]): Promise<string> {
    const backend = selectVisionBackend(mode, visionReady === true, localVisionReady);
    if (backend === "unavailable") throw new Error("Для анализа фото и видео подключи облачный Vision или загрузи локальную модель зрения.");
    const question = [...history].reverse().find(message => message.role === "user")?.content || "Проанализируй вложение.";
    const isVideo = selected[0]?.kind === "video";
    let items: Array<{ mimeType: string; dataBase64: string; timestampMs?: number }>;
    const task: "image" | "video_frames" = isVideo ? "video_frames" : "image";

    if (isVideo) {
      setStatus("QQ AI выбирает кадры видео прямо на устройстве…");
      const frames = await sampleVideoFrames(selected[0].file);
      const selectedFrames = backend === "local" ? selectLocalVideoFrames(frames, 4) : frames;
      items = selectedFrames.map(frame => ({
        mimeType: frame.mimeType,
        dataBase64: dataUrlToBase64(frame.dataUrl),
        timestampMs: frame.timestampMs,
      }));
    } else {
      setStatus("QQ AI подготавливает изображения…");
      const prepared = await Promise.all(selected.map(item => prepareImage(item.file)));
      items = prepared.map(image => ({
        mimeType: image.mimeType,
        dataBase64: dataUrlToBase64(image.dataUrl),
      }));
    }

    if (backend === "local") {
      setStatus(isVideo ? "Локальная модель анализирует видеокадры на устройстве…" : "Локальная модель анализирует фото на устройстве…");
      const localItems = items.map(item => ({
        dataUrl: "data:" + item.mimeType + ";base64," + item.dataBase64,
        ...(typeof item.timestampMs === "number" ? { timestampMs: item.timestampMs } : {}),
      }));
      const answer = await analyzeWithLocalVision(question, localItems);
      const localNote = "\n\n_Изображения обработаны локально в браузере и не отправлялись на сервер. Небольшая модель может ошибаться; проверь важные детали._";
      if (isVideo) {
        const frameNote = "\n\nЛокально рассмотрены кадры с отметками: " +
          items.map(item => ((item.timestampMs ?? 0) / 1000).toFixed(1) + " с").join(", ") +
          ". Звук видео не анализировался.";
        return answer + frameNote + localNote;
      }
      return answer + localNote;
    }

    setStatus(isVideo ? "QQ AI анализирует выбранные кадры…" : "QQ AI анализирует изображение…");
    const response = await fetch("/api/vision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, question, items }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Модуль визуального анализа QQ AI пока не подключён.");
    if (typeof result.answer !== "string" || !result.answer.trim()) {
      throw new Error("QQ AI не получил текстовый ответ от визуального модуля.");
    }
    if (isVideo && Array.isArray(result.analyzedFrames)) {
      return result.answer + "\n\nПроанализированы кадры с временными отметками: " +
        result.analyzedFrames.map((time: number) => (time / 1000).toFixed(1) + " с").join(", ") +
        ". Аудиодорожка не анализировалась.";
    }
    return result.answer;
  }

  function stopSpeech() {
    speechRunRef.current += 1;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeakingMessageIndex(null);
  }

  function speakMessage(content: string, index: number) {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setError("Этот браузер не поддерживает озвучивание текста.");
      return;
    }
    if (speakingMessageIndex === index) {
      stopSpeech();
      return;
    }

    const normalized = content
      .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
      .replace(/https?:\/\/\S+/g, "ссылка")
      .replace(/```[\s\S]*?```/g, "Блок кода.")
      .replace(/[`*_#>|]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) return;

    const sentences = normalized.match(/[^.!?…]+[.!?…]*/gu) || [normalized];
    const chunks: string[] = [];
    let current = "";
    for (const sentence of sentences) {
      if (current && current.length + sentence.length > 1_800) {
        chunks.push(current.trim());
        current = "";
      }
      current += sentence;
    }
    if (current.trim()) chunks.push(current.trim());

    window.speechSynthesis.cancel();
    const run = ++speechRunRef.current;
    let cursor = 0;
    setSpeakingMessageIndex(index);
    const speakNext = () => {
      if (speechRunRef.current !== run) return;
      if (cursor >= chunks.length) {
        setSpeakingMessageIndex(null);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunks[cursor++]);
      utterance.lang = "ru-RU";
      utterance.rate = 1;
      utterance.onend = speakNext;
      utterance.onerror = () => {
        if (speechRunRef.current === run) {
          setSpeakingMessageIndex(null);
          setError("Не удалось озвучить ответ. Проверь доступность голосов в браузере.");
        }
      };
      window.speechSynthesis.speak(utterance);
    };
    speakNext();
  }

  useEffect(() => () => {
    speechRunRef.current += 1;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  function ensureLocalVisionWorker(): Worker {
    if (localVisionWorkerRef.current) return localVisionWorkerRef.current;

    const worker = new Worker(new URL("./workers/local-vision.worker.ts", import.meta.url), {
      type: "module",
    });

    worker.onmessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        progress?: number | null;
        file?: string;
        status?: string;
        message?: string;
        requestId?: string | null;
        answer?: string;
        dtype?: string;
      };

      if (data.type === "loading") {
        setLocalVisionStatus(typeof data.message === "string" ? data.message : "Подготавливаем модель зрения…");
        return;
      }

      if (data.type === "progress") {
        if (typeof data.progress === "number" && Number.isFinite(data.progress)) {
          const percent = data.progress <= 1 ? data.progress * 100 : data.progress;
          setLocalVisionProgress(Math.max(0, Math.min(100, Math.round(percent))));
        }
        setLocalVisionStatus(data.file || data.status || "Скачиваем компоненты модели…");
        return;
      }

      if (data.type === "ready") {
        setLocalVisionReady(true);
        setLocalVisionLoading(false);
        setLocalVisionProgress(100);
        setLocalVisionStatus("Локальная модель зрения готова");
        const pending = localVisionLoadPromiseRef.current;
        localVisionLoadPromiseRef.current = null;
        pending?.resolve();
        return;
      }

      if (data.type === "token") {
        setLocalVisionStatus("Локальная модель анализирует изображение…");
        return;
      }

      if (data.type === "answer" && typeof data.requestId === "string") {
        const pending = localVisionRequestRef.current;
        if (pending?.id === data.requestId) {
          localVisionRequestRef.current = null;
          pending.resolve(typeof data.answer === "string" ? data.answer : "");
        }
        return;
      }

      if (data.type === "error") {
        const errorMessage = typeof data.message === "string" ? data.message : "Ошибка локального анализа изображения.";
        if (typeof data.requestId === "string") {
          const pending = localVisionRequestRef.current;
          if (pending?.id === data.requestId) {
            localVisionRequestRef.current = null;
            pending.reject(new Error(errorMessage));
          }
        } else {
          const pending = localVisionLoadPromiseRef.current;
          localVisionLoadPromiseRef.current = null;
          pending?.reject(new Error(errorMessage));
        }
        setLocalVisionLoading(false);
        setLocalVisionStatus("Локальная модель зрения не готова");
        setError(errorMessage);
      }
    };

    worker.onerror = () => {
      const error = new Error("Локальный модуль зрения завершился с ошибкой. Повтори загрузку модели.");
      localVisionLoadPromiseRef.current?.reject(error);
      localVisionRequestRef.current?.reject(error);
      localVisionLoadPromiseRef.current = null;
      localVisionRequestRef.current = null;
      setLocalVisionLoading(false);
      setLocalVisionStatus("Локальная модель зрения не готова");
    };

    localVisionWorkerRef.current = worker;
    return worker;
  }

  async function loadLocalVisionModel() {
    if (busy || localVisionReady || localVisionLoading || localSpeechLoading || localSpeechRecording || localSpeechTranscribing) return;
    setLocalVisionLoading(true);
    setLocalVisionProgress(0);
    setLocalVisionStatus("Проверяем поддержку WebGPU…");
    setError("");

    try {
      await prepareLocalRuntime("vision");
      const worker = ensureLocalVisionWorker();
      await new Promise<void>((resolve, reject) => {
        localVisionLoadPromiseRef.current = { resolve, reject };
        worker.postMessage({ type: "load" });
      });
      try { await navigator.storage?.persist?.(); } catch { /* Browser persistence is best-effort. */ }
      setStatus("Локальная модель зрения готова");
      setError("");
    } catch (error) {
      setLocalVisionLoading(false);
      const message = error instanceof Error ? error.message : "Не удалось загрузить локальную модель зрения.";
      setLocalVisionStatus("Локальная модель зрения не готова");
      setError(message);
    } finally {
      localVisionLoadPromiseRef.current = null;
    }
  }

  function analyzeWithLocalVision(
    question: string,
    items: Array<{ dataUrl: string; timestampMs?: number }>,
  ): Promise<string> {
    if (!localVisionReady) {
      return Promise.reject(new Error("Сначала загрузи локальную модель зрения."));
    }
    const worker = ensureLocalVisionWorker();
    const requestId = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      if (localVisionRequestRef.current) {
        reject(new Error("Локальная модель уже выполняет анализ."));
        return;
      }
      localVisionRequestRef.current = { id: requestId, resolve, reject };
      worker.postMessage({ type: "analyze", requestId, question, items });
    });
  }

  useEffect(() => () => {
    localVisionLoadPromiseRef.current?.reject(new Error("Окно QQ AI закрыто."));
    localVisionRequestRef.current?.reject(new Error("Окно QQ AI закрыто."));
    localVisionWorkerRef.current?.terminate();
    localVisionWorkerRef.current = null;
  }, []);


  function ensureLocalSpeechWorker(): Worker {
    if (localSpeechWorkerRef.current) return localSpeechWorkerRef.current;

    const worker = new Worker(new URL("./workers/local-speech.worker.ts", import.meta.url), {
      type: "module",
    });

    worker.onmessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        progress?: number | null;
        file?: string;
        status?: string;
        message?: string;
        requestId?: string | null;
        text?: string;
      };

      if (data.type === "loading") {
        setLocalSpeechStatus(typeof data.message === "string" ? data.message : "Подготавливаем локальную модель речи…");
        return;
      }
      if (data.type === "progress") {
        if (typeof data.progress === "number" && Number.isFinite(data.progress)) {
          setLocalSpeechProgress(Math.max(0, Math.min(100, Math.round(data.progress))));
        }
        setLocalSpeechStatus(data.file || data.status || "Скачиваем компоненты Whisper…");
        return;
      }
      if (data.type === "ready") {
        setLocalSpeechReady(true);
        setLocalSpeechLoading(false);
        setLocalSpeechProgress(100);
        setLocalSpeechStatus("Локальная расшифровка готова");
        localSpeechLoadPromiseRef.current?.resolve();
        localSpeechLoadPromiseRef.current = null;
        return;
      }
      if (data.type === "transcribing") {
        setLocalSpeechStatus(typeof data.message === "string" ? data.message : "Распознаём речь локально…");
        return;
      }
      if (data.type === "transcript" && typeof data.requestId === "string") {
        const pending = localSpeechRequestRef.current;
        if (pending?.id === data.requestId) {
          localSpeechRequestRef.current = null;
          pending.resolve(typeof data.text === "string" ? data.text : "");
        }
        return;
      }
      if (data.type === "error") {
        const message = typeof data.message === "string" ? data.message : "Ошибка локальной расшифровки речи.";
        if (typeof data.requestId === "string") {
          const pending = localSpeechRequestRef.current;
          if (pending?.id === data.requestId) {
            localSpeechRequestRef.current = null;
            pending.reject(new Error(message));
          }
        } else {
          localSpeechLoadPromiseRef.current?.reject(new Error(message));
          localSpeechLoadPromiseRef.current = null;
        }
        setLocalSpeechLoading(false);
        setLocalSpeechStatus("Локальная модель речи не готова");
        setError(message);
      }
    };

    worker.onerror = () => {
      const failure = new Error("Локальный модуль распознавания завершился с ошибкой. Повтори загрузку модели.");
      localSpeechLoadPromiseRef.current?.reject(failure);
      localSpeechRequestRef.current?.reject(failure);
      localSpeechLoadPromiseRef.current = null;
      localSpeechRequestRef.current = null;
      setLocalSpeechLoading(false);
      setLocalSpeechStatus("Локальная модель речи не готова");
    };

    localSpeechWorkerRef.current = worker;
    return worker;
  }

  async function loadLocalSpeechModel() {
    if (busy || localSpeechReady || localSpeechLoading || localVisionLoading || localSpeechRecording || localSpeechTranscribing) return;
    setLocalSpeechLoading(true);
    setLocalSpeechProgress(0);
    setLocalSpeechStatus("Проверяем поддержку WebGPU…");
    setError("");

    try {
      await prepareLocalRuntime("speech");
      const worker = ensureLocalSpeechWorker();
      await new Promise<void>((resolve, reject) => {
        localSpeechLoadPromiseRef.current = { resolve, reject };
        worker.postMessage({ type: "load" });
      });
      try { await navigator.storage?.persist?.(); } catch { /* Browser persistence is best-effort. */ }
      setLocalSpeechStatus("Локальное распознавание готово");
      setStatus("Локальная расшифровка готова");
      setError("");
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "Не удалось загрузить локальную модель речи.";
      setLocalSpeechLoading(false);
      setLocalSpeechStatus("Локальная модель речи не готова");
      setError(message);
    } finally {
      localSpeechLoadPromiseRef.current = null;
    }
  }

  function transcribeLocalAudio(samples: Float32Array): Promise<string> {
    if (!localSpeechReady) return Promise.reject(new Error("Сначала загрузи локальную модель распознавания речи."));
    const worker = ensureLocalSpeechWorker();
    const requestId = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      if (localSpeechRequestRef.current) {
        reject(new Error("Локальная модель уже распознаёт запись."));
        return;
      }
      localSpeechRequestRef.current = { id: requestId, resolve, reject };
      worker.postMessage({ type: "transcribe", requestId, samples }, [samples.buffer]);
    });
  }

  async function decodeAndTranscribeLocalAudio(blob: Blob) {
    if (!blob.size) throw new Error("Запись получилась пустой. Повтори попытку.");
    const AudioContextConstructor = window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      throw new Error("Этот браузер не умеет декодировать запись микрофона для локальной расшифровки.");
    }

    let context: AudioContext;
    try {
      context = new AudioContextConstructor({ sampleRate: SPEECH_SAMPLE_RATE });
    } catch {
      context = new AudioContextConstructor();
    }
    try {
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      const channels = Array.from(
        { length: decoded.numberOfChannels },
        (_, index) => decoded.getChannelData(index),
      );
      const samples = resampleTo16kMono(channels, decoded.sampleRate, MAX_LOCAL_SPEECH_SECONDS);
      return await transcribeLocalAudio(samples);
    } finally {
      try { await context.close(); } catch { /* AudioContext may already be closed. */ }
    }
  }

  async function startLocalSpeechRecording() {
    if (!localSpeechReady) {
      setError("Сначала загрузи локальную модель распознавания речи.");
      return;
    }
    if (localSpeechRecording || localSpeechTranscribing) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Этот браузер не поддерживает локальную запись микрофона.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: { ideal: 1 }, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (failure) {
      const name = failure instanceof Error ? failure.name : "";
      setError(name === "NotAllowedError"
        ? "Нет доступа к микрофону. Разреши его в настройках браузера."
        : "Не удалось включить микрофон. Проверь разрешение и повтори попытку.");
      return;
    }

    try {
      const preferredMime = typeof MediaRecorder.isTypeSupported === "function"
        ? ["audio/webm;codecs=opus", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type))
        : undefined;
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);
      localSpeechStreamRef.current = stream;
      localSpeechRecorderRef.current = recorder;
      localSpeechChunksRef.current = [];

      recorder.ondataavailable = event => {
        if (event.data?.size) localSpeechChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        if (localSpeechStopTimerRef.current !== null) {
          window.clearTimeout(localSpeechStopTimerRef.current);
          localSpeechStopTimerRef.current = null;
        }
        setLocalSpeechRecording(false);
        setListening(false);
        localSpeechChunksRef.current = [];
        try {
          if (recorder.state !== "inactive") recorder.stop();
          stream.getTracks().forEach(track => track.stop());
        } catch { /* Stream may already be closed. */ }
        if (localSpeechStreamRef.current === stream) localSpeechStreamRef.current = null;
        setError("Не удалось записать звук. Повтори попытку.");
      };
      recorder.onstop = async () => {
        if (localSpeechStopTimerRef.current !== null) {
          window.clearTimeout(localSpeechStopTimerRef.current);
          localSpeechStopTimerRef.current = null;
        }
        if (localSpeechRecorderRef.current === recorder) localSpeechRecorderRef.current = null;
        stream.getTracks().forEach(track => track.stop());
        if (localSpeechStreamRef.current === stream) localSpeechStreamRef.current = null;
        setLocalSpeechRecording(false);
        setListening(false);
        setLocalSpeechTranscribing(true);

        const blob = new Blob(localSpeechChunksRef.current, { type: recorder.mimeType || preferredMime || "audio/webm" });
        localSpeechChunksRef.current = [];
        setLocalSpeechStatus("Обрабатываем запись на устройстве…");
        try {
          const transcript = await decodeAndTranscribeLocalAudio(blob);
          setDraft(current => appendTranscript(current, transcript));
          setLocalSpeechStatus("Готово. Проверь расшифровку перед отправкой.");
          setVoiceNoticeOpen(false);
          setError("");
        } catch (failure) {
          const message = failure instanceof Error ? failure.message : "Не удалось распознать речь.";
          setLocalSpeechStatus("Локальная расшифровка не выполнена");
          setError(message);
        } finally {
          setLocalSpeechTranscribing(false);
        }
      };

      recorder.start(250);
      setLocalSpeechRecording(true);
      setListening(true);
      setLocalSpeechStatus("Запись идёт. Она остановится через 20 секунд.");
      setError("");
      localSpeechStopTimerRef.current = window.setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, MAX_LOCAL_SPEECH_SECONDS * 1000);
    } catch (failure) {
      stream.getTracks().forEach(track => track.stop());
      localSpeechStreamRef.current = null;
      localSpeechRecorderRef.current = null;
      setLocalSpeechRecording(false);
      setListening(false);
      setError(failure instanceof Error ? failure.message : "Не удалось начать запись.");
    }
  }

  function stopLocalSpeechRecording() {
    const recorder = localSpeechRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      return;
    }
    localSpeechStreamRef.current?.getTracks().forEach(track => track.stop());
    localSpeechStreamRef.current = null;
    setLocalSpeechRecording(false);
    setListening(false);
  }

  useEffect(() => () => {
    if (localSpeechStopTimerRef.current !== null) window.clearTimeout(localSpeechStopTimerRef.current);
    try {
      const recorder = localSpeechRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.onerror = null;
        recorder.stop();
      }
    } catch { /* Recorder may already be stopping. */ }
    localSpeechStreamRef.current?.getTracks().forEach(track => track.stop());
    localSpeechLoadPromiseRef.current?.reject(new Error("Окно QQ AI закрыто."));
    localSpeechRequestRef.current?.reject(new Error("Окно QQ AI закрыто."));
    localSpeechWorkerRef.current?.terminate();
    localSpeechWorkerRef.current = null;
  }, []);

  function beginVoiceRecognition() {
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) {
      setError("В этом браузере нет распознавания речи. Можно использовать голосовой ввод клавиатуры телефона.");
      return;
    }
    try {
      const recognition = new Recognition();
      recognition.lang = "ru-RU";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onresult = (event: any) => {
        let transcript = "";
        for (let i = event.resultIndex || 0; i < event.results.length; i += 1) {
          if (event.results[i].isFinal) transcript += event.results[i][0]?.transcript || "";
        }
        if (transcript.trim()) {
          setDraft(current => current.trim() ? current.trimEnd() + " " + transcript.trim() : transcript.trim());
        }
      };
      recognition.onerror = (event: any) => {
        setListening(false);
        setError(event.error === "not-allowed"
          ? "Нет доступа к микрофону. Разреши его в настройках браузера."
          : "Не удалось распознать речь. Попробуй ещё раз или введи текст.");
      };
      recognition.onend = () => setListening(false);
      recognitionRef.current = recognition;
      setError("");
      setListening(true);
      recognition.start();
    } catch {
      setListening(false);
      setError("Не удалось запустить микрофон. Проверь разрешение браузера.");
    }
  }

  function stopVoiceRecognition() {
    if (localSpeechRecorderRef.current && localSpeechRecorderRef.current.state !== "inactive") {
      stopLocalSpeechRecording();
      return;
    }
    try { recognitionRef.current?.stop(); } catch { /* recognition may already be stopped */ }
    setListening(false);
  }

  async function toggleCompletionNotifications() {
    if (notifyOnComplete) {
      setNotifyOnComplete(false);
      try { localStorage.removeItem("qq-ai-notify-complete"); } catch { /* storage may be unavailable */ }
      return;
    }
    if (!("Notification" in window)) {
      setError("Этот браузер не поддерживает уведомления.");
      return;
    }
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission === "granted") {
      setNotifyOnComplete(true);
      try { localStorage.setItem("qq-ai-notify-complete", "1"); } catch { /* storage may be unavailable */ }
      setError("");
    } else {
      setError("Уведомления не разрешены. Их можно включить в настройках браузера.");
    }
  }

  async function notifyTaskComplete() {
    if (!notifyOnComplete || !document.hidden || !("Notification" in window) || Notification.permission !== "granted") return;
    try {
      const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
      if (registration?.showNotification) {
        await registration.showNotification("QQ AI завершил задачу", { body: "Ответ готов. Можно вернуться к диалогу.", tag: "qq-ai-task-complete" });
      } else {
        new Notification("QQ AI завершил задачу", { body: "Ответ готов. Можно вернуться к диалогу." });
      }
    } catch { /* notification support varies by browser and platform */ }
  }

  async function send() {
    const selected = attachments;
    const content = draft.trim() || (selected.length ? (selected[0].kind === "video" ? "Проанализируй это видео по выбранным кадрам." : "Проанализируй прикреплённое изображение.") : "");
    if ((!content && selected.length === 0) || busy) return;
    if (supabase && (!authLoaded || !cloudLoaded)) {
      setError("QQ AI синхронизирует данные аккаунта. Подожди окончания загрузки и повтори отправку.");
      return;
    }
    if (selected.length === 0 && mode === "offline" && !offlineReady) {
      setError("Сначала нажми «Загрузить и запустить ИИ» и дождись завершения подготовки модели.");
      return;
    }
    if (selected.length > 0 && selectVisionBackend(mode, visionReady === true, localVisionReady) === "unavailable") {
      setError("Сначала загрузи локальную модель зрения или подключи облачный Vision.");
      return;
    }
    const attachmentInfo = selected.map(item => ({ name: item.name, kind: item.kind }));
    const next = [...messages, { role: "user" as const, content, ...(attachmentInfo.length ? { attachments: attachmentInfo } : {}) }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setDraft(""); setBusy(true); setError("");
    setStatus(selected.length ? "QQ AI подготавливает вложения…" : mode === "online" ? "QQ AI подключается к облачной модели…" : "Локальная модель формирует ответ…");
    try {
      if (selected.length > 0) {
        const answer = await sendVision(next, selected);
        setMessages([...next, { role: "assistant", content: answer }]);
        selected.forEach(item => URL.revokeObjectURL(item.previewUrl));
        setAttachments(current => current.filter(item => !selected.some(sent => sent.id === item.id)));
      } else {
        const calculation = calculateMathQuestion(content);
        if (calculation) {
          setMessages([...next, { role: "assistant", content: calculation }]);
          setStatus("Расчёт выполнен");
          await notifyTaskComplete();
          return;
        }
        if (mode === "online" && onlineModelReady === false) {
          if (offlineReady) {
            setMode("offline");
            setStatus("Облачная модель не подключена. Переключаюсь на локальную…");
            await sendOffline(next);
          } else if (shouldSearchWeb(content)) {
            const searchAnswer = await sendSearchFallback(content);
            setMessages([...next, { role: "assistant", content: searchAnswer }]);
          } else {
            throw new Error("Облачная модель QQ AI ещё не подключена. Переключись на «Офлайн» и загрузи локальную модель, чтобы получить ответ.");
          }
        } else if (mode === "online") {
          try {
            await sendOnline(next);
          } catch (onlineError) {
            if (offlineReady) {
              setMode("offline");
              setStatus("Онлайн-модель недоступна. Переключаюсь на локальную…");
              await sendOffline(next);
            } else if (shouldSearchWeb(content)) {
              const searchAnswer = await sendSearchFallback(content);
              setMessages([...next, { role: "assistant", content: searchAnswer }]);
            } else throw onlineError;
          }
        } else await sendOffline(next);
      }
      setStatus("Задача завершена");
      await notifyTaskComplete();
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
    if (value.length > MAX_MEMORY_CHARS) {
      setError("Одна запись памяти не может быть длиннее " + MAX_MEMORY_CHARS + " символов.");
      return;
    }
    const next = normalizeMemoryEntries([...memories, value]);
    if (memories.some(item => item.toLocaleLowerCase("ru-RU") === value.toLocaleLowerCase("ru-RU"))) {
      setError("Такая запись уже есть в памяти.");
      return;
    }
    setMemories(next); setMemoryDraft(""); setError("");
    if (supabase && session?.user) {
      const { error: saveError } = await supabase.from("qq_ai_preferences").upsert({
        user_id: session.user.id, memory_enabled: memoryEnabled, learned_preferences: next, updated_at: new Date().toISOString(),
      });
      if (saveError) setError("Не удалось сохранить память в облако: " + saveError.message);
    }
  }

  async function removeMemory(index: number) {
    const next = memories.filter((_, itemIndex) => itemIndex !== index);
    setMemories(next);
    if (supabase && session?.user) {
      const { error: saveError } = await supabase.from("qq_ai_preferences").upsert({
        user_id: session.user.id, memory_enabled: memoryEnabled, learned_preferences: next, updated_at: new Date().toISOString(),
      });
      if (saveError) setError("Не удалось обновить память в облаке: " + saveError.message);
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

  return <main className="shell" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
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
            <button className={mode === "online" ? "selected" : ""} onClick={() => { setMode("online"); setError(""); setStatus(onlineModelReady === true ? "Облачная модель подключена" : "Облачная модель пока не подключена"); }}>Онлайн</button>
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
          <p className="welcome-copy">Задавай вопросы, исследуй идеи и создавай новое. После загрузки локальная модель сможет отвечать прямо в браузере, а для актуальных тем искать источники в интернете.</p>
          {mode === "online" && onlineModelReady === false && <div className="offline-card">
            <div><b>Онлайн-модель пока не подключена</b><small>Сейчас доступны интернет-поиск и локальная модель после загрузки. Можно перейти в офлайн-режим.</small></div>
            <button className="primary" onClick={() => { setMode("offline"); setStatus(offlineReady ? "Офлайн-модель готова" : "Сначала подготовь офлайн-модель"); }}>Открыть локальный режим</button>
          </div>}
          <div className="suggestions">
            <button onClick={() => setDraft("Помоги мне разобраться в новой теме и составь понятный план изучения.")}><span>✦</span><b>Разобраться в теме</b><small>Объяснение простыми словами</small></button>
            <button onClick={() => setDraft("Помоги придумать и развить интересную идею.")}><span>⌁</span><b>Развить идею</b><small>От задумки до плана</small></button>
            <button onClick={() => setDraft("Помоги написать или улучшить текст.")}><span>✎</span><b>Работа с текстом</b><small>Написание и редактура</small></button>
          </div>
          {mode === "offline" && !offlineReady && <div className="offline-card">
            <div><b>Подготовить офлайн-модель</b><small>Первое скачивание модели — около 1 ГБ. Загрузи её по Wi‑Fi один раз; затем она будет доступна без интернета.</small></div>
            <button className="primary" onClick={loadOfflineModel} disabled={busy}>{busy ? "Загрузка…" : "Загрузить модель"}</button>
            {busy && <div className="progress"><span style={{ width: progress + "%" }} /></div>}
          </div>}
          <div className="welcome-foot"><span className="status-pulse" />{mode === "online" ? capabilitiesUnavailable ? "Не удалось проверить статус моделей" : onlineModelReady === true ? "QQ AI Online · модель сервера подключена" : onlineModelReady === false ? "QQ AI Online · модель ещё не размещена; поиск доступен отдельно" : "Проверяем онлайн-модель…" : offlineReady ? "Локальная модель готова" : "Локальная модель ещё не загружена"}</div>
        </div> : <div className="conversation">
          {messages.map((m, i) => <article className={`message ${m.role}`} key={i}>
            <div className="message-avatar">{m.role === "assistant" ? <span>QQ</span> : "Вы"}</div>
            <div className="message-body"><div className="sender">{m.role === "assistant" ? "QQ AI" : "Вы"}</div>
              {m.attachments?.length ? <div className="message-attachment-labels">{m.attachments.map((item, index) => <span key={index}>{item.kind === "video" ? "▶" : "▧"} {item.name}</span>)}</div> : null}
              <div className={`bubble ${m.role === "assistant" ? "markdown-body" : "user-text"}`}>{m.content ? (m.role === "assistant" ? <Suspense fallback={<span>{m.content}</span>}><MarkdownMessage content={m.content} /></Suspense> : m.content) : (busy ? <span className="typing"><i/><i/><i/></span> : "")}</div>
              {m.role === "assistant" && m.content && <div className="feedback"><button className={`speak-button ${speakingMessageIndex === i ? "active" : ""}`} title={speakingMessageIndex === i ? "Остановить озвучивание" : "Озвучить ответ"} aria-label={speakingMessageIndex === i ? "Остановить озвучивание" : "Озвучить ответ"} aria-pressed={speakingMessageIndex === i} disabled={busy && i === messages.length - 1} onClick={() => speakMessage(m.content, i)}>{speakingMessageIndex === i ? "Стоп" : "Озвучить"}</button><button title="Полезный ответ" onClick={() => void rateAnswer(1)}>↑</button><button title="Неудачный ответ" onClick={() => void rateAnswer(-1)}>↓</button><small>Оценить ответ</small></div>}
            </div>
          </article>)}
          <div ref={bottom} />
        </div>}
      </div>

      {error && <div className="error-banner">{error}{mode === "online" && onlineModelReady === false && error.includes("ещё не размещена") && <button className="secondary-button" onClick={() => { setMode("offline"); setError(""); setStatus(offlineReady ? "Офлайн-модель готова" : "Сначала подготовь офлайн-модель"); }}>Перейти в офлайн-режим</button>}</div>}
      {mode === "offline" && !offlineReady && messages.length > 0 && <div className="offline-inline"><span>Офлайн-модель не загружена</span><button onClick={loadOfflineModel} disabled={busy}>Подготовить</button>{busy && <span>{progress}%</span>}</div>}
      {!localVisionReady && (mode === "offline" || visionReady !== true) && <div className="offline-inline local-vision-inline">
        <span>{localVisionLoading ? localVisionStatus || "Загружаем локальную модель зрения…" : "Локальный анализ изображений — без отправки фото на сервер."}</span>
        <button onClick={() => void loadLocalVisionModel()} disabled={busy || localVisionLoading || localSpeechLoading || localSpeechRecording || localSpeechTranscribing}>{localVisionLoading ? localVisionProgress + "%" : "Загрузить Vision · ~190–270 МБ"}</button>
        {localVisionLoading && <span>{localVisionProgress}%</span>}
      </div>}
      {localVisionReady && <div className="offline-inline local-vision-inline"><span>Локальное зрение готово · фото обрабатываются на устройстве</span><span>WebGPU</span></div>}
      {busy && <div className="task-running"><span className="task-running-dot" /><span><b>QQ AI выполняет задачу</b><small>Можно переключиться на другую вкладку. Не закрывай браузер, пока ответ не готов.</small></span></div>}
      <footer className="composer-area">
        {attachments.length > 0 && <div className="attachment-tray">
          {attachments.map(item => <div className="attachment-preview" key={item.id}>
            {item.kind === "image" ? <img src={item.previewUrl} alt={item.name} /> : <video src={item.previewUrl} muted playsInline />}
            <span title={item.name}>{item.name}</span>
            <button type="button" onClick={() => removeAttachment(item.id)} disabled={busy} aria-label={"Удалить " + item.name}>×</button>
          </div>)}
          <div className="attachment-note">{selectVisionBackend(mode, visionReady === true, localVisionReady) === "cloud" ? "Файлы отправятся в облачный Vision только после нажатия «Отправить». Для видео передаются выбранные кадры, не исходный ролик." : "Фото и выбранные видеокадры останутся на этом устройстве. Исходное видео и его звук не отправляются."}</div>
        </div>}
        <div className="composer">
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple hidden onChange={handleFileSelection} />
          <button className="attach-button" type="button" onClick={() => fileInputRef.current?.click()} disabled={busy || !canAttachMedia(mode, visionReady === true, localVisionReady)} aria-label="Прикрепить фото или видео" title={canAttachMedia(mode, visionReady === true, localVisionReady) ? "Прикрепить фото или видео" : "Загрузи локальную модель зрения или дождись облачного Vision"}>＋</button>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder={mode === "online" ? "Спросите о чём угодно…" : offlineReady ? "Сообщение для локальной модели…" : "Можно посчитать пример или загрузить локальную модель"} rows={1} disabled={busy} />
          <button className="search-button" type="button" onClick={() => void searchWeb()} disabled={!draft.trim() || attachments.length > 0 || busy} aria-label="Поиск в интернете" title="Искать запрос в интернете">⌕</button>
          <button className={`voice-button ${listening ? "listening" : ""}`} onClick={() => listening ? stopVoiceRecognition() : setVoiceNoticeOpen(true)} disabled={busy} aria-label={listening ? "Остановить запись" : "Голосовой ввод"} title={listening ? "Остановить запись" : "Голосовой ввод"}>{listening ? "■" : <VoiceIcon />}</button>
          <button className="send-button" onClick={() => void send()} disabled={(!draft.trim() && attachments.length === 0) || busy} aria-label="Отправить"><span>↑</span></button>
        </div>
        <div className="composer-meta"><span>{status}</span><span className="composer-meta-actions"><button className={`notification-toggle ${notifyOnComplete ? "enabled" : ""}`} onClick={() => void toggleCompletionNotifications()} title="Уведомить, когда задача завершится">{notifyOnComplete ? "Уведомления включены" : "Уведомлять о готовности"}</button><span>{modeLabel} · {mode === "offline" ? "Локальная модель" : onlineModelReady === true ? "QQ AI Online · модель сервера" : onlineModelReady === false ? "QQ AI Online · пока без модели" : capabilitiesUnavailable ? "статус недоступен" : "проверка статуса"}{attachments.length > 0 && selectVisionBackend(mode, visionReady === true, localVisionReady) === "local" && " · вложения остаются на устройстве"}{attachments.length > 0 && selectVisionBackend(mode, visionReady === true, localVisionReady) === "cloud" && " · вложения отправятся в облачный Vision"}{mode === "online" && visionReady === false && !localVisionReady && " · Vision ещё не подключён"}</span></span></div>
      </footer>
    </section>

    {voiceNoticeOpen && <div className="modal-backdrop" onClick={() => { if (!localSpeechRecording && !localSpeechTranscribing) setVoiceNoticeOpen(false); }}><section className="modal" onClick={e => e.stopPropagation()}>
      <button className="modal-close" onClick={() => { if (!localSpeechRecording && !localSpeechTranscribing) setVoiceNoticeOpen(false); }} disabled={localSpeechRecording || localSpeechTranscribing}>×</button><div className="modal-symbol"><VoiceIcon /></div><h2>Голосовой ввод</h2>
      <p>Можно использовать распознавание браузера: в зависимости от него звук может обрабатываться внешним сервисом. Локальный вариант скачивает мультиязычную Whisper Tiny и обрабатывает запись на устройстве; аудио не отправляется и не сохраняется. Расшифровка появится в поле сообщения — проверь её перед отправкой.</p>
      {!localSpeechReady && <button className="secondary-button full" onClick={() => void loadLocalSpeechModel()} disabled={localSpeechLoading || busy || localVisionLoading || localSpeechRecording || localSpeechTranscribing}>
        {localSpeechLoading ? "Загружаем модель · " + localSpeechProgress + "%" : "Загрузить локальную модель · ~70–90 МБ"}
      </button>}
      {localSpeechLoading && <small>{localSpeechStatus || "Скачивание и подготовка…"}</small>}
      {localSpeechReady && !localSpeechRecording && !localSpeechTranscribing && <button className="secondary-button full" onClick={() => void startLocalSpeechRecording()} disabled={busy}>Записать локально</button>}
      {localSpeechRecording && <button className="primary full" onClick={stopLocalSpeechRecording}>Остановить и распознать</button>}
      {localSpeechTranscribing && <small>Распознаём запись на устройстве…</small>}
      {localSpeechStatus && <small>{localSpeechStatus}</small>}
      <button className="primary full" style={{marginTop:8}} onClick={() => { setVoiceNoticeOpen(false); beginVoiceRecognition(); }} disabled={localSpeechRecording || localSpeechTranscribing}>Продолжить через браузер</button>
      <button className="secondary-button full" style={{marginTop:8}} onClick={() => setVoiceNoticeOpen(false)} disabled={localSpeechRecording || localSpeechTranscribing}>Отмена</button>
    </section></div>}

    {authOpen && <div className="modal-backdrop" onClick={() => setAuthOpen(false)}><section className="modal" onClick={e => e.stopPropagation()}>
      <button className="modal-close" onClick={() => setAuthOpen(false)}>×</button><div className="modal-symbol">QQ</div><h2>{session ? "Аккаунт QQ AI" : "Синхронизация с облаком"}</h2>
      {session ? <><p>Вход выполнен: {session.user.email}. История и память синхронизируются с облаком.</p><button className="secondary-button" onClick={async () => { await supabase?.auth.signOut(); setAuthOpen(false); }}>Выйти</button></> :
      <><p>Войди по электронной почте, чтобы сохранять диалоги и настройки между устройствами.</p><input className="modal-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Электронная почта" disabled={otpSent} />{otpSent ? <><input className="modal-input" inputMode="numeric" value={otpCode} onChange={e => setOtpCode(e.target.value)} placeholder="Код из письма" /><button className="primary full" onClick={() => void verifyEmailCode()}>Подтвердить код</button><button className="secondary-button full" onClick={() => { setOtpSent(false); setOtpCode(""); setAuthMessage(""); }}>Изменить почту</button></> : <button className="primary full" onClick={() => void signIn()}>Получить код для входа</button>}<small>{authMessage}</small></>}
    </section></div>}

    {settingsOpen && <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}><section className="modal settings-modal" onClick={e => e.stopPropagation()}>
      <button className="modal-close" onClick={() => setSettingsOpen(false)}>×</button><div className="eyebrow">ПЕРСОНАЛИЗАЦИЯ</div><h2>Память QQ AI</h2>
      <p>Память выключена по умолчанию. Записи хранятся на этом устройстве и после входа могут синхронизироваться с облаком. Не сохраняй пароли и другие секретные данные.</p>
      <label className="toggle-row"><span><b>Использовать память</b><small>Учитывать сохранённые предпочтения в ответах</small></span><input type="checkbox" checked={memoryEnabled} onChange={e => void toggleMemory(e.target.checked)} /></label>
      <div className="memory-entry"><input className="modal-input" value={memoryDraft} maxLength={MAX_MEMORY_CHARS} onChange={e => setMemoryDraft(e.target.value)} placeholder="Например: объясняй коротко и с примерами" /><button className="secondary-button" onClick={() => void saveMemory()}>Добавить</button></div>
      {memories.length > 0 && <ul className="memory-list">{memories.map((m, i) => <li key={i}>{m}<button onClick={() => void removeMemory(i)}>Удалить</button></li>)}</ul>}
      <div className="cloud-line">{cloudStatus}</div>
    </section></div>}
  </main>;
}