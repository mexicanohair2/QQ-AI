import { useEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { createClient, type Session } from "@supabase/supabase-js";
import { calculateMathQuestion } from "./lib/math";
import { dataUrlToBase64, prepareImage, sampleVideoFrames } from "./lib/media";
import { buildSearchContext, shouldSearchWeb, type QQSearchSource } from "./lib/qq-ai-core";
import { readOpenAIChatStream } from "./lib/openai-stream";
import { readChatMessages, type ChatMessage } from "./lib/chat-storage";
import { buildMemoryInstruction, normalizeMemoryEntries, readStoredMemories, persistStoredMemories, readStoredMemoryEnabled, persistStoredMemoryEnabled, MAX_MEMORY_CHARS } from "./lib/user-memory";

type Message = ChatMessage;
type MediaAttachment = { id: string; file: File; name: string; kind: "image" | "video"; previewUrl: string };
type Mode = "online" | "offline";
const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
const CHAT_KEY = "qq-ai-chat-v2";
const THREAD_KEY = "qq-ai-thread-v1";
const SYSTEM = `Ты QQ AI — полезный, честный и спокойный ИИ-помощник. Отвечай на языке пользователя. Если не знаешь ответа, прямо скажи об этом. Не выдумывай факты.\n\nФОРМАТ ОТВЕТОВ:\n- Используй Markdown: короткие жирные заголовки, абзацы, списки и таблицы, когда они действительно улучшают читаемость.\n- Ссылки оформляй как [понятный текст](https://...). Не создавай вымышленные ссылки.\n- В математике показывай понятные шаги и записывай формулы через LaTeX: $...$ внутри строки и $...$ отдельным блоком.\n- В конце математического решения выделяй итог одной строкой в формате ==Ответ: ...==; для уравнений по возможности используй \\boxed{...}.\n- Не называй ответ правильным, если вычисления не проверены. После решения проверь подстановкой или обратным вычислением, когда это возможно.\n- Завершай выполненную задачу ясным результатом, не продолжай работу без необходимости.`;
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function remarkAnswerUnderline() {
  return (tree: any) => {
    const visit = (node: any): void => {
      if (!Array.isArray(node.children)) return;
      const next: any[] = [];
      for (const child of node.children) {
        if (child.type === "text" && typeof child.value === "string" && child.value.includes("==")) {
          const parts = child.value.split(/==(.*?)==/g);
          parts.forEach((part: string, index: number) => {
            if (!part) return;
            if (index % 2 === 1) {
              next.push({ type: "strong", data: { hProperties: { className: ["answer-underline"] } }, children: [{ type: "text", value: part }] });
            } else {
              next.push({ type: "text", value: part });
            }
          });
        } else {
          visit(child);
          next.push(child);
        }
      }
      node.children = next;
    };
    visit(tree);
  };
}

function VoiceIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2.5" width="6" height="12" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M8.5 21.5h7" /></svg>;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>(readChatMessages);
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
  const [capabilitiesUnavailable, setCapabilitiesUnavailable] = useState(false);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<MediaAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [voiceNoticeOpen, setVoiceNoticeOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakingMessageIndex, setSpeakingMessageIndex] = useState<number | null>(null);
  const speechRunRef = useRef(0);
  const recognitionRef = useRef<any>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [memoryEnabled, setMemoryEnabled] = useState(() => readStoredMemoryEnabled() ?? false);
  const memoryPersistenceReadyRef = useRef(false);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [memories, setMemories] = useState<string[]>(() => readStoredMemories());
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
    if (!memoryPersistenceReadyRef.current) {
      memoryPersistenceReadyRef.current = true;
      return;
    }
    persistStoredMemories(memories);
    persistStoredMemoryEnabled(memoryEnabled);
  }, [memories, memoryEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-40)));
      localStorage.setItem(THREAD_KEY, threadId);
    } catch { /* local storage may be unavailable */ }
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, threadId]);

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
      return;
    }
    let alive = true;
    setCloudLoaded(false);
    setCloudStatus("Подключаем облако…");
    Promise.all([
      supabase.from("qq_ai_threads").select("id,messages").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("qq_ai_preferences").select("memory_enabled,learned_preferences").eq("user_id", session.user.id).maybeSingle(),
    ]).then(async ([threadResult, prefsResult]) => {
      if (!alive) return;
      if (threadResult.data?.messages && Array.isArray(threadResult.data.messages)) {
        const cloudMessages = threadResult.data.messages as Message[];
        if (cloudMessages.length) {
          setMessages(cloudMessages.slice(-40));
          setThreadId(threadResult.data.id);
        }
      }
      const localMemories = readStoredMemories();
      const localMemoryEnabled = readStoredMemoryEnabled();
      const cloudMemories = normalizeMemoryEntries(prefsResult.data?.learned_preferences);
      const mergedMemories = normalizeMemoryEntries([...localMemories, ...cloudMemories]);
      const memoryEnabledValue = localMemoryEnabled ?? Boolean(prefsResult.data?.memory_enabled);
      setMemoryEnabled(memoryEnabledValue);
      setMemories(mergedMemories);

      setCloudStatus("Облако подключено");
      if (threadResult.error || prefsResult.error) {
        setCloudStatus("Облако подключено частично");
      } else if (prefsResult.data || localMemories.length > 0 || localMemoryEnabled !== null) {
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
    if (mode !== "online") {
      setError("Фото и видео обрабатываются только в режиме QQ AI Online.");
      return;
    }
    if (visionReady !== true) {
      setError(visionReady === false
        ? "Модуль анализа изображений и видео QQ AI ещё не подключён."
        : "Сначала дождись проверки доступности модуля Vision.");
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
    if (visionReady !== true) throw new Error("Модуль анализа изображений и видео QQ AI ещё не подключён.");
    const question = [...history].reverse().find(message => message.role === "user")?.content || "Проанализируй вложение.";
    const isVideo = selected[0]?.kind === "video";
    let items: Array<{ mimeType: string; dataBase64: string; timestampMs?: number }>;
    const task: "image" | "video_frames" = isVideo ? "video_frames" : "image";

    if (isVideo) {
      setStatus("QQ AI выбирает кадры видео прямо на устройстве…");
      const frames = await sampleVideoFrames(selected[0].file);
      items = frames.map(frame => ({
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
    if (selected.length === 0 && mode === "offline" && !offlineReady) {
      setError("Сначала нажми «Загрузить и запустить ИИ» и дождись завершения подготовки модели.");
      return;
    }
    if (selected.length > 0 && mode !== "online") {
      setError("Переключись в онлайн-режим: локальная модель не обрабатывает фото и видео.");
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
              <div className={`bubble ${m.role === "assistant" ? "markdown-body" : "user-text"}`}>{m.content ? (m.role === "assistant" ? <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath, remarkAnswerUnderline]} rehypePlugins={[rehypeKatex]}>{m.content}</ReactMarkdown> : m.content) : (busy ? <span className="typing"><i/><i/><i/></span> : "")}</div>
              {m.role === "assistant" && m.content && <div className="feedback"><button className={`speak-button ${speakingMessageIndex === i ? "active" : ""}`} title={speakingMessageIndex === i ? "Остановить озвучивание" : "Озвучить ответ"} aria-label={speakingMessageIndex === i ? "Остановить озвучивание" : "Озвучить ответ"} aria-pressed={speakingMessageIndex === i} disabled={busy && i === messages.length - 1} onClick={() => speakMessage(m.content, i)}>{speakingMessageIndex === i ? "Стоп" : "Озвучить"}</button><button title="Полезный ответ" onClick={() => void rateAnswer(1)}>↑</button><button title="Неудачный ответ" onClick={() => void rateAnswer(-1)}>↓</button><small>Оценить ответ</small></div>}
            </div>
          </article>)}
          <div ref={bottom} />
        </div>}
      </div>

      {error && <div className="error-banner">{error}{mode === "online" && onlineModelReady === false && error.includes("ещё не размещена") && <button className="secondary-button" onClick={() => { setMode("offline"); setError(""); setStatus(offlineReady ? "Офлайн-модель готова" : "Сначала подготовь офлайн-модель"); }}>Перейти в офлайн-режим</button>}</div>}
      {mode === "offline" && !offlineReady && messages.length > 0 && <div className="offline-inline"><span>Офлайн-модель не загружена</span><button onClick={loadOfflineModel} disabled={busy}>Подготовить</button>{busy && <span>{progress}%</span>}</div>}
      {busy && <div className="task-running"><span className="task-running-dot" /><span><b>QQ AI выполняет задачу</b><small>Можно переключиться на другую вкладку. Не закрывай браузер, пока ответ не готов.</small></span></div>}
      <footer className="composer-area">
        {attachments.length > 0 && <div className="attachment-tray">
          {attachments.map(item => <div className="attachment-preview" key={item.id}>
            {item.kind === "image" ? <img src={item.previewUrl} alt={item.name} /> : <video src={item.previewUrl} muted playsInline />}
            <span title={item.name}>{item.name}</span>
            <button type="button" onClick={() => removeAttachment(item.id)} disabled={busy} aria-label={"Удалить " + item.name}>×</button>
          </div>)}
          <div className="attachment-note">Файлы отправятся только после нажатия «Отправить». Для видео передаются отдельные кадры, не исходный ролик.</div>
        </div>}
        <div className="composer">
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple hidden onChange={handleFileSelection} />
          <button className="attach-button" type="button" onClick={() => fileInputRef.current?.click()} disabled={busy || mode !== "online" || visionReady !== true} aria-label="Прикрепить фото или видео" title={mode !== "online" ? "Медиа доступно в онлайн-режиме" : visionReady === false ? "Модуль Vision пока не подключён" : visionReady === null ? "Проверяем доступность Vision" : "Прикрепить фото или видео"}>＋</button>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder={mode === "online" ? "Спросите о чём угодно…" : offlineReady ? "Сообщение для локальной модели…" : "Можно посчитать пример или загрузить локальную модель"} rows={1} disabled={busy} />
          <button className="search-button" type="button" onClick={() => void searchWeb()} disabled={!draft.trim() || attachments.length > 0 || busy} aria-label="Поиск в интернете" title="Искать запрос в интернете">⌕</button>
          <button className={`voice-button ${listening ? "listening" : ""}`} onClick={() => listening ? stopVoiceRecognition() : setVoiceNoticeOpen(true)} disabled={busy} aria-label={listening ? "Остановить запись" : "Голосовой ввод"} title={listening ? "Остановить запись" : "Голосовой ввод"}>{listening ? "■" : <VoiceIcon />}</button>
          <button className="send-button" onClick={() => void send()} disabled={(!draft.trim() && attachments.length === 0) || busy} aria-label="Отправить"><span>↑</span></button>
        </div>
        <div className="composer-meta"><span>{status}</span><span className="composer-meta-actions"><button className={`notification-toggle ${notifyOnComplete ? "enabled" : ""}`} onClick={() => void toggleCompletionNotifications()} title="Уведомить, когда задача завершится">{notifyOnComplete ? "Уведомления включены" : "Уведомлять о готовности"}</button><span>{modeLabel} · {mode === "offline" ? "Локальная модель" : onlineModelReady === true ? "QQ AI Online · модель сервера" : onlineModelReady === false ? "QQ AI Online · пока без модели" : capabilitiesUnavailable ? "статус недоступен" : "проверка статуса"}{mode === "online" && attachments.length > 0 && " · вложения будут отправлены онлайн"}{mode === "online" && visionReady === false && " · Vision ещё не подключён"}</span></span></div>
      </footer>
    </section>

    {voiceNoticeOpen && <div className="modal-backdrop" onClick={() => setVoiceNoticeOpen(false)}><section className="modal" onClick={e => e.stopPropagation()}>
      <button className="modal-close" onClick={() => setVoiceNoticeOpen(false)}>×</button><div className="modal-symbol"><VoiceIcon /></div><h2>Голосовой ввод</h2>
      <p>Браузер распознает речь и вставит расшифровку в поле сообщения. В зависимости от браузера аудио может обрабатываться его удалённым сервисом распознавания. Текст можно проверить и изменить до отправки QQ AI.</p>
      <button className="primary full" onClick={() => { setVoiceNoticeOpen(false); beginVoiceRecognition(); }}>Продолжить</button>
      <button className="secondary-button full" style={{marginTop:8}} onClick={() => setVoiceNoticeOpen(false)}>Отмена</button>
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