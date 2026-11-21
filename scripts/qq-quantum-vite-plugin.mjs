/**
 * QQ Quantum integration for the existing QQ AI interface.
 * Applies narrow, fail-closed source replacements to App.tsx at Vite build time.
 */
export function qqQuantumIntegration() {
  return {
    name: "qq-quantum-dual-mode",
    enforce: "pre",
    transform(source, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/App.tsx")) return null;
      let code = source;
      const replaceExactlyOnce = (from, to, label) => {
        const first = code.indexOf(from);
        if (first < 0 || code.indexOf(from, first + from.length) >= 0) {
          throw new Error("[qq-quantum] Cannot safely patch App.tsx: " + label);
        }
        code = code.slice(0, first) + to + code.slice(first + from.length);
      };

      replaceExactlyOnce(
        'import { readOpenAIChatStream } from "./lib/openai-stream";',
        'import { readOpenAIChatStream } from "./lib/openai-stream";\nimport { importQuantumModelHtml, loadQuantumAssets } from "./lib/qq-quantum-assets";',
        "add Quantum assets import"
      );
      replaceExactlyOnce(
        '  const engine = useRef<any>(null);',
        `  const quantumWorkerRef = useRef<Worker | null>(null);
  const quantumLoadPendingRef = useRef<{ resolve: () => void; reject: (error: Error) => void; timer: number } | null>(null);
  const quantumRequestRef = useRef<{ id: string; resolve: (answer: string) => void; reject: (error: Error) => void; timer: number } | null>(null);
  const quantumFileInputRef = useRef<HTMLInputElement>(null);`,
        "replace WebLLM engine state"
      );
      replaceExactlyOnce(
        `      if (runtime === "text" && engine.current) {
        const previousEngine = engine.current;
        await previousEngine.unload();
        if (engine.current === previousEngine) engine.current = null;
        setOfflineReady(false);
        released = true;
      }`,
        `      if (runtime === "text" && quantumWorkerRef.current) {
        quantumLoadPendingRef.current?.reject(new Error("Загрузка QQ Quantum остановлена для освобождения памяти."));
        quantumRequestRef.current?.reject(new Error("Запрос QQ Quantum остановлен для освобождения памяти."));
        window.clearTimeout(quantumLoadPendingRef.current?.timer);
        window.clearTimeout(quantumRequestRef.current?.timer);
        quantumLoadPendingRef.current = null;
        quantumRequestRef.current = null;
        quantumWorkerRef.current.terminate();
        quantumWorkerRef.current = null;
        setOfflineReady(false);
        released = true;
      }`,
        "replace text runtime unload"
      );

      const loadStart = code.indexOf("  async function loadOfflineModel() {");
      const searchStart = code.indexOf("  async function sendSearchFallback", loadStart);
      if (loadStart < 0 || searchStart < 0) throw new Error("[qq-quantum] Could not locate offline model loader.");
      const loadBlock = `  async function loadOfflineModel() {
    if (busy || offlineReady || localVisionLoading || localSpeechLoading || localSpeechRecording || localSpeechTranscribing) return;
    setBusy(true);
    setError("");
    setProgress(0);
    setStatus("Проверяем сохранённую копию QQ Quantum…");
    try {
      await prepareLocalRuntime("text");
      setStatus("Первый запуск может занять несколько секунд: загружаем собственную модель с сайта…");
      const assets = await loadQuantumAssets();
      if (!assets) {
        throw new Error("Сайт не предоставил файл модели QQ Quantum.");
      }
      const worker = new Worker(new URL("./workers/qq-quantum.worker.ts", import.meta.url), { type: "module" });
      quantumWorkerRef.current = worker;
      worker.onmessage = (event: MessageEvent) => {
        const data = event.data as { type?: string; requestId?: string | null; answer?: string; message?: string; trainingStep?: number };
        if (data.type === "ready") {
          setProgress(100);
          setOfflineReady(true);
          setStatus("Собственная модель QQ Quantum готова · шаг " + (data.trainingStep ?? "?"));
          const pending = quantumLoadPendingRef.current;
          if (pending) {
            window.clearTimeout(pending.timer);
            quantumLoadPendingRef.current = null;
            pending.resolve();
          }
          return;
        }
        if (data.type === "answer" && typeof data.requestId === "string" && typeof data.answer === "string") {
          const pending = quantumRequestRef.current;
          if (pending && pending.id === data.requestId) {
            window.clearTimeout(pending.timer);
            quantumRequestRef.current = null;
            pending.resolve(data.answer);
          }
          return;
        }
        if (data.type === "error") {
          const failure = new Error(data.message || "Ошибка собственной модели QQ Quantum.");
          if (data.requestId) {
            const pending = quantumRequestRef.current;
            if (pending && pending.id === data.requestId) {
              window.clearTimeout(pending.timer);
              quantumRequestRef.current = null;
              pending.reject(failure);
            }
          } else {
            const pending = quantumLoadPendingRef.current;
            if (pending) {
              window.clearTimeout(pending.timer);
              quantumLoadPendingRef.current = null;
              pending.reject(failure);
            }
          }
        }
      };
      worker.onerror = () => {
        const failure = new Error("Локальный Worker QQ Quantum завершился с ошибкой.");
        const loadPending = quantumLoadPendingRef.current;
        if (loadPending) {
          window.clearTimeout(loadPending.timer);
          quantumLoadPendingRef.current = null;
          loadPending.reject(failure);
        }
        const requestPending = quantumRequestRef.current;
        if (requestPending) {
          window.clearTimeout(requestPending.timer);
          quantumRequestRef.current = null;
          requestPending.reject(failure);
        }
        if (quantumWorkerRef.current === worker) quantumWorkerRef.current = null;
        setOfflineReady(false);
        setStatus("Рабочий поток QQ Quantum остановлен.");
      };
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => {
          quantumLoadPendingRef.current = null;
          worker.terminate();
          if (quantumWorkerRef.current === worker) quantumWorkerRef.current = null;
          reject(new Error("Загрузка QQ Quantum заняла слишком много времени. Проверь свободную память браузера."));
        }, 120000);
        quantumLoadPendingRef.current = { resolve, reject, timer };
        try {
          worker.postMessage({ type: "load", assets });
        } catch (failure) {
          window.clearTimeout(timer);
          quantumLoadPendingRef.current = null;
          worker.terminate();
          if (quantumWorkerRef.current === worker) quantumWorkerRef.current = null;
          reject(failure instanceof Error ? failure : new Error("Не удалось запустить QQ Quantum."));
        }
      });
      try { await navigator.storage?.persist?.(); } catch { /* best effort */ }
    } catch (failure) {
      setOfflineReady(false);
      setError(failure instanceof Error ? failure.message : "Не удалось загрузить QQ Quantum.");
      setStatus("Офлайн-модель не готова");
    } finally {
      setBusy(false);
    }
  }

  async function importQuantumModel(file: File) {
    if (busy) return;
    setBusy(true);
    setError("");
    setStatus("Проверяем HTML-файл и сохраняем собственные веса QQ Quantum…");
    try {
      const assets = await importQuantumModelHtml(file);
      const previousWorker = quantumWorkerRef.current;
      if (previousWorker) {
        const loadPending = quantumLoadPendingRef.current;
        const requestPending = quantumRequestRef.current;
        quantumLoadPendingRef.current = null;
        quantumRequestRef.current = null;
        if (loadPending) {
          window.clearTimeout(loadPending.timer);
          loadPending.reject(new Error("Загрузка заменена новой версией QQ Quantum."));
        }
        if (requestPending) {
          window.clearTimeout(requestPending.timer);
          requestPending.reject(new Error("Модель заменена новой версией QQ Quantum."));
        }
        previousWorker.terminate();
        quantumWorkerRef.current = null;
      }
      setOfflineReady(false);
      setStatus("Модель QQ Quantum сохранена локально · шаг " + assets.metadata.training_step + ". Нажми «Загрузить QQ Quantum».");
      setProgress(100);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Не удалось импортировать QQ Quantum.");
      setStatus("Импорт модели не выполнен");
    } finally {
      setBusy(false);
    }
  }

`;
      code = code.slice(0, loadStart) + loadBlock + code.slice(searchStart);

      const offlineStart = code.indexOf("  async function sendOffline(history: Message[]) {");
      const fileStart = code.indexOf("  function handleFileSelection", offlineStart);
      if (offlineStart < 0 || fileStart < 0) throw new Error("[qq-quantum] Could not locate offline chat handler.");
      const offlineBlock = `  async function sendOffline(history: Message[]) {
    const worker = quantumWorkerRef.current;
    if (!worker || !offlineReady) {
      throw new Error("Собственная модель QQ Quantum не загружена. Импортируй HTML-файл модели и нажми «Загрузить модель».");
    }
    if (quantumRequestRef.current) throw new Error("QQ Quantum уже обрабатывает предыдущий запрос.");
    const requestId = crypto.randomUUID();
    setStatus("Собственная модель QQ Quantum формирует ответ локально…");
    return await new Promise<string>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        quantumRequestRef.current = null;
        reject(new Error("Локальная модель не ответила за отведённое время. Попробуй более короткий запрос."));
      }, 120000);
      quantumRequestRef.current = { id: requestId, resolve, reject, timer };
      const safeHistory = history.slice(-8).map(item => ({
        role: item.role,
        content: String(item.content || "").slice(0, 3000),
      }));
      try {
        worker.postMessage({ type: "chat", requestId, messages: safeHistory });
      } catch (failure) {
        window.clearTimeout(timer);
        quantumRequestRef.current = null;
        reject(failure instanceof Error ? failure : new Error("Не удалось передать запрос в QQ Quantum."));
      }
    }).then(answer => {
      setMessages([...history, { role: "assistant", content: answer }]);
      return answer;
    });
  }

`;
      code = code.slice(0, offlineStart) + offlineBlock + code.slice(fileStart);

      replaceExactlyOnce(
        '    const content = draft.trim();\n    if (!content || busy) return;',
        '    const content = draft.trim();\n    if (mode === "offline") { setError("В офлайн-режиме сетевые запросы отключены. Переключись на Онлайн для поиска в интернете."); return; }\n    if (!content || busy) return;',
        "block web search in offline mode"
      );

      replaceExactlyOnce(
        '          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple hidden onChange={handleFileSelection} />',
        '          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple hidden onChange={handleFileSelection} />\n          <input ref={quantumFileInputRef} type="file" accept=".html,text/html" hidden onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void importQuantumModel(file); }} />',
        "add own model HTML importer"
      );

      replaceExactlyOnce(
        'Первое скачивание модели — около 1 ГБ. Загрузи её по Wi‑Fi один раз; затем она будет доступна без интернета.',
        'При первом запуске сайт скачает собственную модель QQ Quantum (около 3,6 МБ) и сохранит её на устройстве. Следующие запуски доступны без повторного скачивания.',
        "replace Qwen download copy"
      );
      replaceExactlyOnce(
        '<button className="primary" onClick={loadOfflineModel} disabled={busy}>{busy ? "Загрузка…" : "Загрузить модель"}</button>',
        '<button className="primary" onClick={loadOfflineModel} disabled={busy}>{busy ? "Загрузка…" : "Загрузить QQ Quantum"}</button><button className="secondary-button" onClick={() => quantumFileInputRef.current?.click()} disabled={busy}>Импортировать HTML-модель</button>',
        "add own model import action"
      );
      replaceExactlyOnce(
        '<button onClick={loadOfflineModel} disabled={busy}>Подготовить</button>',
        '<button onClick={loadOfflineModel} disabled={busy}>Загрузить QQ Quantum</button><button onClick={() => quantumFileInputRef.current?.click()} disabled={busy}>Импортировать HTML-модель</button>',
        "add import action in conversation"
      );
      replaceExactlyOnce(
        'Для ответов QQ AI нужен серверный ключ DeepSeek и настройки API.',
        'Собственная более мощная модель QQ Quantum Online ещё обучается и пока не подключена к серверу.',
        "remove external LLM dependency copy"
      );

      replaceExactlyOnce(
        '  const modeLabel = useMemo(() => mode === "online" ? "Онлайн" : "Офлайн", [mode]);',
        '  const modeLabel = useMemo(() => mode === "online" ? "Онлайн" : "QQ Quantum", [mode]);',
        "rename offline label to QQ Quantum"
      );
      replaceExactlyOnce(
        '<button className={mode === "offline" ? "selected" : ""} onClick={() => { setMode("offline"); setError(""); setStatus(offlineReady ? "Офлайн-модель готова" : "Сначала подготовь офлайн-модель"); }}>Офлайн</button>',
        '<button className={mode === "offline" ? "selected" : ""} onClick={() => { setMode("offline"); setError(""); if (!offlineReady) void loadOfflineModel(); else setStatus("Собственная модель QQ Quantum готова"); }}>Quantum</button>',
        "rename local mode button"
      );
      replaceExactlyOnce(
        'Подготовить офлайн-модель',
        'Подготовить собственную QQ Quantum',
        "rename local model card"
      );
      replaceExactlyOnce(
        'mode === "offline" ? "Локальная модель" :',
        'mode === "offline" ? "Собственная модель QQ Quantum" :',
        "label the actual local model"
      );
      replaceExactlyOnce(
        'Открыть офлайн-режим',
        'Открыть QQ Quantum',
        "rename offline mode action"
      );
      replaceExactlyOnce(
        'Офлайн-модель готова',
        'Собственная модель QQ Quantum готова',
        "rename local ready status"
      );
      replaceExactlyOnce(
        'Сообщение для локальной модели…',
        'Сообщение для QQ Quantum…',
        "rename local composer placeholder"
      );
      replaceExactlyOnce(
        'Онлайн-модель QQ AI не настроена на сервере. Проверь адрес API, название модели и наличие серверного ключа DeepSeek для Preview. Офлайн-режим автоматически не включается.',
        'Собственная модель QQ Quantum Online ещё не подключена к серверу. Переключись на Quantum для локального общения после импорта пакета модели.',
        "remove third-party generation configuration from chat errors"
      );
      replaceExactlyOnce(
        'В офлайн-режиме сетевые запросы отключены. Переключись на Онлайн для поиска в интернете.',
        'Поиск в интернете запускается отдельно; ответы в режиме Quantum формируются локальной собственной моделью.',
        "describe local mode search behavior"
      );
      code = code.replaceAll("Офлайн-модель не загружена", "QQ Quantum не загружена");
      code = code.replaceAll("Офлайн-модель не готова", "QQ Quantum не готова");

      replaceExactlyOnce(
        'const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";\n',
        "",
        "remove unused third-party text-model identifier"
      );
      code = code
        .replaceAll("Офлайн-режим", "режим QQ Quantum")
        .replaceAll("Офлайн-модель", "QQ Quantum")
        .replaceAll("Офлайн", "QQ Quantum")
        .replaceAll("Локальная модель формирует ответ…", "QQ Quantum формирует ответ…")
        .replaceAll("Локальная модель не ответила за отведённое время", "QQ Quantum не ответила за отведённое время");

      if (code.includes("engine.current")) {
        throw new Error("[qq-quantum] An unpatched WebLLM engine reference remains in App.tsx.");
      }
      return { code, map: null };
    },
  };
}
