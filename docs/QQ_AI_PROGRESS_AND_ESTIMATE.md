# QQ AI — progress and realistic delivery estimate

Last verified: 2026-11-18 (application code commit `a7f5e96d120dc0c9a59675f5efa00d6f82d161f2`; later commits only updated CI reporting and documentation). This document describes the feature branch preview, not a production release.

## Verified now

- GitHub Actions quality workflow for commit \`064a6524a77213527f8d50c1890f53fd58c319c9\` completed successfully.
- Vercel preview deployment \`dpl_Hw4GuDr46DtJSAwPf1ZPmWi7VarG\` is READY on \`feature/multimodal-search-voice\`.
- Preview root returns HTTP 200.
- \`/api/capabilities\` returns HTTP 200 and reports:
  - QQ Online text model: unconfigured.
  - Web search: available through DuckDuckGo HTML result snippets.
  - Image understanding: unconfigured.
  - Video understanding: unconfigured.
  - Qwen offline: available in the browser when WebGPU and storage requirements are met.
- The workflow verifies game-AI contracts, online/search/media tests, benchmark schema, training-data validator, TypeScript, and production build.
- No physical Honor 400 test has been completed. HTTP 200 is not proof that microphone, camera, video sampling, or WebGPU work on the device.

## Feature status

| Area | Current state | Remaining work |
|---|---|---|
| Web app / chat UI | Implemented in preview | Mobile browser QA, accessibility, error-state polish |
| Qwen Offline | Existing WebLLM integration | Real Honor 400 WebGPU and storage test |
| QQ Online gateway | Server-side adapter and capability reporting implemented | Deploy an actual QQ model endpoint and verify streamed inference |
| QQ Search | DuckDuckGo search snippets, URL sanitation, citations/context contract | Robust live tests, full-page extraction, source corroboration, search controls |
| Photos | Attachment UI, client preparation, protected server route contract | Deploy and test a compatible vision model; OCR/table/formula/chart acceptance |
| Video | Local sampling of up to eight timestamped frames; audio is not uploaded | Vision inference for frames; separate audio transcription and synchronized audio/video analysis |
| Voice | Browser speech-to-text prototype | Device/browser compatibility tests; separate audio conversation/transcription model |
| QQ Knowledge | Product contracts/planning only | Document ingestion, indexing, retrieval, source attribution, access controls and deletion |
| QQ-owned model | Candidate research, benchmark, data contract and validator | Select base/revision, curate approved data, train QQ checkpoint, evaluate, quantize and host |
| QQ Game AI | Server contract and tests; same QQ Online gateway | Live model test; later integration into QQCross only after explicit approval |

## What is the main blocker?

The online gateway is application code, not a neural network. The repository does not yet contain trained QQ weights or a running GPU inference server. Vercel preview hosting builds the web app and API routes; it is not a persistent GPU model host.

A secret/API key cannot create a model or GPU. For a QQ-controlled deployment, the server needs a model endpoint and model weights. A key is optional only if the chosen private inference host requires authentication; it is not something the assistant can invent.

The practical first QQ model is a QQ fine-tuned/adapted checkpoint based on a reviewed open-weight base. Training a foundation model from random initialization is a separate, much larger research project. The project must not claim superiority to Qwen until both models pass the same Russian benchmark.

## Planning estimate (not a promise)

These are engineering estimates after the required compute path and model revision are available. Free GPU availability, queue time, model compatibility, and device testing can change them.

1. **First live QQ Online text model:** approximately 3–7 working days to connect, deploy and test a suitable already-trained open-weight model on approved GPU hosting. This would be a hosted base model, not yet proof of QQ fine-tuning or superiority.
2. **First QQ-adapted text checkpoint:** approximately 2–4 additional weeks for a small, reviewed training dataset, supervised fine-tuning, regression tests, benchmark comparison, quantization and deployment. Longer if the free compute window is insufficient.
3. **Real image understanding:** approximately 1–2 additional weeks after selecting and hosting a compatible vision model, including OCR, tables, formulas, charts and screenshot tests.
4. **Video plus audio:** approximately 1–3 additional weeks after image inference, because frame sampling alone does not understand the soundtrack; audio transcription and timestamp alignment are separate work.
5. **QQ Knowledge and full product hardening:** approximately 1–3 additional weeks, depending on ingestion sources, privacy requirements, retrieval quality, and mobile QA.

A useful first online release is therefore measured in **weeks**, not hours. A solid multimodal release is more realistically **several weeks to a few months**. These estimates assume an available, suitable compute service. If only no-card/free resources are allowed and none offers enough GPU time, there is no honest fixed delivery date until that constraint is solved.

## Rules for the next phase

- Continue only on \`feature/multimodal-search-voice\`; keep the PR in draft.
- Do not merge, deploy to production, modify QQCross, or build an APK.
- Do not enable paid compute, add a payment method, or create a billable service without explicit adult project-owner approval.
- Do not ask the user to paste API keys into chat.
- Keep Qwen Offline separate from QQ Online; no silent fallback.
- Report each milestone only after its tests pass. Never label a UI placeholder as working AI.


## Обновление 18 ноября 2026 — явный запуск QQ Search

Добавлена отдельная кнопка поиска в поле сообщения. Она вызывает `POST /api/search` напрямую и не зависит от наличия QQ Online inference endpoint; поиск можно использовать и при выбранном локальном режиме. Кнопка блокируется при пустом запросе, активной задаче или прикреплённых медиафайлах. Результат явно помечается как поисковая выдача, а не как ответ генеративной модели.

Это делает веб-поиск доступным как отдельную рабочую функцию, но не устраняет главный блокер QQ AI Online: собственные веса модели и сервер инференса пока не размещены. Vision также остаётся без модели. Новая кнопка должна пройти CI и проверку preview до объявления доступной в развёрнутой версии.


## Обновление 18 ноября 2026 — устойчивость чата, UX и зависимости

### Что добавлено и проверено

- Потоковый клиентский парсер вынесен в `src/lib/openai-stream.ts`. Он обрабатывает разрезанные сетевые чанки, CRLF/LF-разделители, последний SSE-фрагмент без завершающей пустой строки, совместимый JSON-ответ, пустые/ошибочные ответы и ограничение размера.
- В `api/chat.ts` таймер 55 секунд теперь действует до фактического закрытия или отмены потока, а не снимается сразу после отправки заголовков ответа.
- Если QQ Online не настроен, стартовый экран предлагает явно перейти к Qwen Offline. Ошибка проверки статуса больше не маскируется под подтверждённое отсутствие модели.
- Плагины сборки отделены от runtime-зависимостей: Vite и `@vitejs/plugin-react` находятся в devDependencies. Vite закреплён на 6.4.6, React-плагин — на 5.2.0.
- KaTeX закреплён на 0.19.1; npm override заставляет `rehype-katex` и `micromark-extension-math` использовать исправленную версию вместо вложенной 0.16.x.
- В CI добавлен отдельный отчёт аудита runtime-зависимостей.

### Проверки и preview

- GitHub Actions для commit `9397b40f565250c1edfc5f42c01c6dab5d58568f` завершился успешно: benchmark syntax, training-data validator, Game AI tests, online-core tests, TypeScript и production build.
- Preview deployment `dpl_5iDDEjG7aUPYi2fQZLYgB3Kf4GmQ` — READY: https://qq-ai-preview-gdex0scdx-mexicanohaie.vercel.app
- Проверено: главная страница отвечает HTTP 200; `/api/capabilities` отвечает HTTP 200.
- Фактический capability status preview: QQ Online — unconfigured; QQ Search — available (DuckDuckGo snippets); image/video understanding — unconfigured; Qwen Offline — available при поддержке WebGPU и достаточном хранилище.
- `npm audit --omit=dev` в CI: 0 уязвимостей runtime-зависимостей.
- Полный audit продолжает показывать 4 high для dev/build-цепочки Vite → fdir/tinyglobby/picomatch. В текущем дереве это инструменты разработки/сборки, не runtime-зависимости приложения. Для picomatch GitHub Advisory указывает затронутые версии до 4.0.7; опубликованного исправленного релиза в используемом registry на момент проверки нет. Не подавлять предупреждение и перепроверять при обновлении toolchain.
- Vite сообщает о крупном WebLLM chunk около 6.16 MB (gzip около 2.18 MB). Это код локального движка, загружаемый при переходе к офлайн-модели, а не обычный стартовый HTML/основной UI chunk. Оптимизация загрузки остаётся отдельной задачей.

### Что всё ещё не подтверждено

- Онлайн-генерация QQ AI не работает до размещения реальной модели и inference endpoint. Никакая настройка интерфейса не заменяет веса модели и GPU.
- Vision и видеоанализ не работают без vision endpoint. Видеокадры подготавливаются локально, звук не анализируется.
- Не проведён физический тест на Honor 400: WebGPU, первое скачивание Qwen, память браузера, микрофон и мобильная производительность остаются непроверенными.
- HTTP 200 для страницы и capability API не доказывает успешную работу POST-поиска, инференса или устройства. Эти сценарии требуют отдельной функциональной проверки.
- В репозитории пока нет зафиксированного `package-lock.json`; CI разрешает зависимости через `npm install`. Добавление воспроизводимого lockfile остаётся задачей следующего этапа.

### Границы релиза

Эта версия годится для проверки интерфейса, отдельного веб-поиска и подготовки Qwen Offline. Она **не является завершённым релизом QQ AI Online**. PR остаётся draft; merge, production deploy, интеграция в QQCross и APK не выполнялись.


### Дополнительная проверка Supabase 18 ноября 2026

- Проверено, что таблицы `qq_ai_threads`, `qq_ai_preferences` и `qq_ai_feedback` существуют, RLS включён.
- Проверены политики: чтение/изменение диалогов и предпочтений ограничено `auth.uid() = user_id`; отправка и чтение feedback также ограничены владельцем.
- Добавлена и проверена миграция `add_qq_ai_feedback_thread_id_index`: индекс `qq_ai_feedback_thread_id_idx` ускоряет связь feedback с диалогом.
- Vercel содержит `VITE_SUPABASE_URL` и `VITE_SUPABASE_PUBLISHABLE_KEY` для preview/production/development; значения ключей не включены в этот отчёт.
- Supabase Security Advisor сообщает, что защита от скомпрометированных паролей отключена. QQ AI использует OTP-вход по email, а не парольный вход; настройка остаётся отдельным пунктом проверки.
- Сам факт наличия RLS и env-переменных не подтверждает реальную доставку OTP-писем. Фактический вход с тестовым почтовым адресом и синхронизация на двух устройствах пока не проверены.
