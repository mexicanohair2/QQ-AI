# QQ AI — progress and realistic delivery estimate

Last verified: 2026-11-18 (feature-branch code commit `cdf48428104e0005359e7dd912786c2ec48aaab5`; GitHub Actions run `44329282854` SUCCESS). The currently deployed preview must be rebuilt from this newer commit before its status can be considered current. This document describes the feature-branch preview, not a production release.

## Verified now

- GitHub Actions quality workflow for commit \`064a6524a77213527f8d50c1890f53fd58c319c9\` completed successfully.
- Vercel preview deployment \`dpl_Hw4GuDr46DtJSAwPf1ZPmWi7VarG\` is READY on \`feature/multimodal-search-voice\`.
- Preview root returns HTTP 200.
- \`/api/capabilities\` returns HTTP 200 and reports:
  - QQ Online text model: unconfigured.
  - Web search: available through DuckDuckGo HTML result snippets.
  - Cloud image/video understanding: unconfigured.
  - Local browser Vision: implemented in a separate WebGPU worker; requires a compatible browser/device and an explicit model download.
  - Qwen offline: available in the browser when WebGPU and storage requirements are met.
- The workflow verifies game-AI contracts, online/search/media tests, benchmark schema, training-data validator, TypeScript, and production build.
- No physical Honor 400 test has been completed. HTTP 200 is not proof that microphone, camera, video sampling, or WebGPU work on the device.

## Feature status

| Area | Current state | Remaining work |
|---|---|---|
| Web app / chat UI | Implemented in preview | Mobile browser QA, accessibility, error-state polish |
| Qwen Offline | Existing WebLLM integration | Real Honor 400 WebGPU and storage test |
| QQ Online gateway | Server-side adapter and capability reporting implemented | Deploy an actual QQ model endpoint and verify streamed inference |
| QQ Search | DuckDuckGo + Bing queried concurrently; deduplicated, sanitized results and source context; route tests use mocked provider responses | Live POST on deployed preview, full-page extraction and source corroboration |
| Photos | Local WebGPU Vision worker is integrated; cloud Vision route is still unconfigured | Test first download/inference on Honor 400; validate Russian OCR, tables, formulas, charts and image QA |
| Video | Local mode samples up to four evenly distributed timestamped frames and analyzes them in the browser; audio is not uploaded | Device test, quality checks across clips, and separate audio transcription/synchronized audio-video analysis |
| Voice | Browser SpeechRecognition fallback plus explicit local Whisper Tiny WebGPU worker; ≤20-second microphone recording is converted to 16 kHz mono and inserted as an editable draft | Physical device test, Russian accuracy/performance and Honor 400 compatibility |
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


## Обновление 18 ноября 2026 — ограничения тел запросов и актуальная сборка

### Изменения

- Добавлен модуль src/lib/bounded-response.ts: чтение входящего и внешнего HTTP-тела ограничивается по фактическим байтам во время потокового чтения; Content-Length проверяется заранее, но не считается единственной защитой.
- Ограничение применяется к POST /api/chat (520 КБ), POST /api/search (2 КБ), POST /api/vision (4,3 МБ) и поисковой выдаче DuckDuckGo (2,5 МБ).
- Внешняя выдача больше не считывается целиком до проверки её размера. При превышении лимита чтение отменяется.
- Добавлены тесты на завышенный Content-Length, превышение лимита уже во время чтения, корректное сохранение UTF-8 при разделении символов между чанками и использование ограниченного чтения всеми тремя API-маршрутами.
- Потоковый парсер src/lib/openai-stream.ts покрыт тестами для фрагментированного SSE, CRLF, последнего события без завершающего разделителя, совместимого обычного JSON-ответа, пустого и слишком большого ответа.
- Таймер онлайн-маршрута остаётся активным в течение чтения потока и снимается после завершения либо отмены downstream-потока.

### Точная проверка последней версии

- Коммит: ceb8f3cab5b23dae0efc9bc9c370b78c7b5acdf7.
- GitHub Actions run 44297262571: SUCCESS. Успешно завершены dependency audit steps, benchmark syntax, training-data validator, Game AI tests, online-core tests, TypeScript check и production build.
- Полный npm audit: четыре high в dev/build-цепочке vite → fdir/tinyglobby/picomatch; runtime audit через npm audit --omit=dev: ноль уязвимостей. Проблема dev-цепочки не скрыта и остаётся открытым пунктом обновления зависимостей.
- Vercel preview deployment dpl_39PE9KGpHpVPtXtpi1u2imTMTAE2 — READY, соответствует указанному коммиту: https://qq-ai-preview-qp308m7u7-mexicanohaie.vercel.app
- Главная страница проверена через Vercel preview fetch: HTTP 200.
- /api/capabilities проверен через Vercel preview fetch: HTTP 200. Реальный статус: QQ Online — unconfigured; QQ Search — available через поисковые сниппеты; image/video understanding — unconfigured; Qwen Offline — available при поддержке WebGPU и достаточных ресурсах устройства.

### Что проверено и что ещё нет

- Проверки CI подтверждают тесты контракта, статическую типизацию и production build.
- Проверка главной страницы и capabilities не доказывает, что POST-поиск реально получил ответ от DuckDuckGo; live POST-сценарий остаётся отдельной ручной проверкой.
- Qwen ID сверён с официальным каталогом WebLLM; оценка VRAM в каталоге — около 945 МБ. Реальная загрузка и генерация на Honor 400 не тестировались.
- Онлайн-генерация, реальный vision и аудиоанализ видео по-прежнему не работают до размещения подходящих весов и inference endpoint.
- PR #1 остаётся draft; merge, production deploy, изменения QQCross и APK не выполнялись.


## Обновление 18 ноября 2026 — защита upstream-ответов и потоков

### Изменения в feature-ветке

- `api/chat.ts`: при ошибке upstream-модели тело ответа отменяется и внутренние сообщения провайдера не пересылаются клиенту. Добавлен тест на отсутствие утечки диагностик.
- `api/vision.ts`: ответ vision-провайдера читается с лимитом 256 КБ; ошибки upstream очищены; некорректный JSON, пустые и слишком длинные ответы обрабатываются безопасно. Добавлен тест на эти условия.
- `api/chat.ts` и `api/search.ts`: при неуспешном ответе поискового провайдера upstream-поток отменяется; добавлен регрессионный тест.
- Все изменения находятся в `feature/multimodal-search-voice`; PR #1 не объединён с основной веткой.

### Проверка preview

- Точный commit preview: `688747364cf6e2e6019a1a4ef26fae4a1bca0524`.
- Vercel deployment `dpl_8amLjo1FpeCeomcV682HJghAaC4b` — READY.
- Vercel build выполнил `tsc -b && vite build`; TypeScript и production build завершились успешно.
- Vercel install log сообщил о четырёх high-severity npm audit findings. В этом запуске подробный JSON-отчёт не получен, поэтому затронутые пакеты и применимость к runtime не подтверждены. Не запускать слепой `npm audit fix --force`; требуется отдельный точный аудит.
- Vite сообщил о крупном WebLLM runtime chunk около 6,16 МБ (gzip около 2,18 МБ). Это отдельный тяжёлый chunk локального движка; фактическую загрузку только при выборе Qwen следует подтвердить браузерным сетевым тестом.
- Отдельные unit-тесты в этом preview build не запускались. Тесты добавлены в репозиторий, но их прохождение на этом commit не подтверждено.
- Прямая проверка страницы и API через браузерный инструмент в этой сессии не удалась; статус READY подтверждает успешную сборку и публикацию preview, но не полный пользовательский сценарий.

### Исправление устаревшей заметки о lockfile

В предыдущем разделе указано, что `package-lock.json` отсутствует. Это устарело: в текущей ветке файл существует (lockfileVersion 3). При этом текущий Vercel build log показывает команду `npm install`, а не `npm ci`; воспроизводимая установка через lockfile ещё не подтверждена.

### Оставшиеся release blockers

- QQ Online всё ещё не имеет настроенных `QQ_AI_API_URL` и `QQ_AI_MODEL`; live generation недоступна.
- Vision endpoint не имеет настроенной vision-модели; изображения и видео пока не анализируются моделью.
- Полный npm audit требует получения подробного отчёта и устранения/обоснования четырёх high findings.
- Нужно запустить полный набор тестов на точном commit, затем проверить preview: root, capabilities, реальный POST-поиск, текстовый маршрут, Qwen load/generation, upload и отмену медиа.
- Не выполнено физическое тестирование на Honor 400.
- PR остаётся draft; production deploy и интеграция в QQCross не выполнялись.


## Обновление 18 ноября 2026 — защита локальной истории и блокировка недоступного Vision

- Добавлен `src/lib/chat-storage.ts`: восстановление истории из localStorage теперь проверяет роли, тип и длину сообщений, фильтрует некорректные вложения и ограничивает восстановленную историю 40 последними сообщениями. Ошибки и повреждённый JSON не ломают запуск приложения.
- Загрузка фото/видео заблокирована, пока capability API не подтвердит, что Vision-модель действительно настроена. Это предотвращает бессмысленную отправку файлов в заведомо неработающий модуль; проверка также повторяется в `sendVision`.
- Добавлены регрессионные тесты для повреждённой истории и состояния Vision.
- Последний preview: `dpl_5RVYSzetbB5YwUP8LVTJxR9BLgPo`, READY, commit `9f928a261617deade7e7ac8c69cd684fa6276aab`.
- Vercel выполнил `tsc -b && vite build`; сборка завершилась успешно. Отдельные Node-тесты этим deployment не запускались.
- Полный npm install audit продолжает сообщать о четырёх high findings; подробный отчёт не получен. Не устранять это слепым `npm audit fix --force`.
- QQ Online и Vision всё ещё не имеют настроенных inference endpoints; текущий preview не является завершённым мультимодальным ИИ.
- Не проверены ручные сценарии браузера, WebGPU/загрузка Qwen и фактическая работа на Honor 400.


## Обновление 18 ноября 2026 — локальный режим по умолчанию и поиск с ответом модели

### Изменения в feature-ветке

- При первом открытии приложение выбирает доступный локальный режим, а не неподключённый облачный endpoint.
- Стартовый экран показывает одну явную команду «Загрузить и запустить ИИ». До завершения подготовки локальной модели отправка сообщения блокируется, чтобы не создавать пустые сообщения в истории.
- Для запросов об актуальных событиях локальная модель сначала обращается к отдельному поисковому endpoint, получает ограниченные проверяемые поисковые источники и формирует ответ с учётом этих данных. Если поиск не сработал, модель получает явную инструкцию не выдавать сведения за проверенные.
- Убраны публичные упоминания стороннего бренда модели из интерфейса и ответа capabilities API. Технический идентификатор модели остаётся внутренней настройкой движка.
- Голосовая кнопка использует векторную SVG-иконку вместо эмодзи.

### Проверка кода и preview

- Проверенный commit: `063898ae001015f87480c901b8e4d5dd72d12b73`.
- GitHub Actions run `44304028807` — SUCCESS. Успешно завершились 6 Game AI тестов, 40 online-core/benchmark тестов, 4 проверки валидатора обучающих данных, TypeScript и production build.
- `npm audit --omit=dev`: 0 уязвимостей в production-зависимостях. Полный audit по-прежнему показывает 4 high в dev/build-цепочке; они не скрыты.
- Vercel preview deployment `dpl_DydDonpy4p9SgbpQGdZ22V8fhxwH` — READY: https://qq-ai-preview-6zji6mpv5-mexicanohaie.vercel.app
- Главная страница: HTTP 200. `/api/capabilities`: HTTP 200.
- Реальный capability status: online text — unconfigured; web search — available; image/video inference — unconfigured; offline text — available при поддержке WebGPU и достаточной памяти/хранилища.

### Не объявлять готовым без следующих проверок

- Физическая загрузка модели и генерация ответа на Honor 400 не подтверждены; браузерная проверка WebGPU на самом устройстве обязательна.
- Веб-поиск интегрирован в локальный ответ, но живой POST-запрос к поисковому endpoint в этой проверке отдельно не выполнен.
- QQ AI Online с собственной размещённой моделью, а также анализ изображений и видео пока не работают без inference endpoints.
- Эта версия даёт локальный путь генерации после загрузки модели, но не является обученной собственной foundation model QQ AI и не доказывает превосходство над другими моделями.
- PR остаётся draft; merge, production deploy и изменения QQCross не выполнялись.


## Обновление 18 ноября 2026 — озвучивание ответов и безопасный резервный режим

### Изменения

- Добавлено локальное озвучивание готовых ответов через Speech Synthesis браузера: русский язык, разбиение длинных ответов на части, отдельная кнопка «Озвучить» / «Стоп», отмена предыдущего воспроизведения и остановка при закрытии приложения.
- Если пользователь выбрал онлайн-режим, но облачная модель не настроена, приложение больше не отправляет обычный запрос в заведомо недоступный шлюз: при готовой локальной модели оно переключается на офлайн-ответ; для запросов с поисковым намерением доступен отдельный поиск; в остальных случаях показывается точное объяснение.
- Если настроенная онлайн-модель временно недоступна, при загруженной локальной модели предусмотрено переключение на неё.
- Сборка теперь сначала запускает оба набора автоматических тестов, затем TypeScript и production build. Это не позволяет опубликовать сборку, если контрактные тесты сломались.

### Проверка

- Код приложения и тесты: commit `e4002f3f606b5c6330c644e3b6a4a91768ff7050`.
- Сборка с тестами: commit `da897cef752137509197352b21996474430855c4`.
- Vercel preview `dpl_6wizvtDv5pPCRfhsoy195y2grgop` — READY: https://qq-ai-preview-mukb48k3k-mexicanohaie.vercel.app
- В build log: 42 теста пройдены, 0 ошибок; TypeScript check и Vite production build завершились успешно.
- Vite оставляет предупреждение о большом WebLLM chunk (~6,16 МБ; gzip ~2,18 МБ). Это не ошибка сборки, но остаётся фактором первой загрузки локального движка.

### Ограничения, которые остаются

- На Vercel настроены только переменные Supabase; `QQ_AI_API_URL`, `QQ_AI_MODEL` и Vision endpoint отсутствуют. Следовательно, облачная генерация и анализ изображений/видео не активны.
- Ручное воспроизведение речи, WebGPU-загрузка и генерация на Honor 400 не проверены физически.
- Живой POST-запрос к DuckDuckGo/Bing через deployed endpoint в этой сессии не проверен; поисковые парсеры и контракты покрыты тестами.
- PR остаётся в отдельной feature-ветке; merge, production deploy и изменения QQCross не выполнялись.


## Дополнительная проверка 18 ноября 2026 — поиск, память и защита аккаунтов

### Последняя проверенная кодовая версия

- Feature-branch commit: `870358c576a1905182906750046a31049e03c73f`.
- GitHub Actions run `44322333933`: SUCCESS. Game AI — 6/6 тестов; online/search/media/memory — 55/55; валидатор обучающих данных — 4/4; TypeScript и production build — успешно.
- Production dependency audit: 0 уязвимостей. Полный audit по-прежнему сообщает 4 high в dev/build-цепочке Vite → fdir/tinyglobby/picomatch; они не относятся к runtime dependency set. Не запускать принудительное обновление major-версий без проверки совместимости.
- Preview для этого кода должен быть отдельно создан и проверен по точному commit SHA; READY для более ранней версии не считать подтверждением актуального кода.

### Поиск

- `POST /api/search` запрашивает DuckDuckGo и Bing параллельно, а не ждёт первый удачный источник.
- Результаты объединяются равномерно, нормализуются и очищаются от повторяющихся URL; небезопасные схемы/адреса отбрасываются.
- В заголовках поисковых ссылок экранируется Markdown, чтобы текст страницы не мог подменить ссылку.
- Добавлены тесты реального обработчика с подменёнными HTTP-ответами: оба провайдера, дубликаты, отказ одного провайдера, cross-origin и запрет не-web Origin. Это проверка логики API, но не доказательство доступности DDG/Bing из production-сети.
- `/api/capabilities` отражает оба поисковых провайдера. Полное извлечение страниц и синтез ответов облачной моделью не подключены.

### Память и Supabase

- Записи памяти ограничены 20 элементами по 240 символов, нормализуются и очищаются от управляющих символов/дубликатов.
- Память передаётся модели как недоверенные данные с явным запретом исполнять инструкции из записей.
- Локальные записи и флаг включения сохраняются между перезапусками; флаг имеет отметку времени, поэтому при синхронизации выбирается более новое явное значение между устройством и облаком.
- Локальные ключи разделены по Supabase user ID; анонимная память хранится отдельно. При смене аккаунта локальные записи другого пользователя не должны попадать в prompt.
- Для `qq_ai_threads`, `qq_ai_preferences` и `qq_ai_feedback` проверено включение RLS и политики доступа по `auth.uid() = user_id`.
- Supabase Security Advisor продолжает предупреждать, что проверка скомпрометированных паролей отключена. QQ AI использует email OTP; настройка не менялась.

### Ограничения

- QQ Online и Vision остаются `unconfigured`: собственные веса QQ и GPU inference endpoint не размещены.
- Офлайн Qwen доступен только при поддержке WebGPU и достаточном хранилище; реальная загрузка и генерация на Honor 400 не проверены.
- Живой POST-запрос к deployed `/api/search` в этой проверке не выполнялся; автоматические тесты запускают сам route handler с контролируемыми upstream responses.
- Preview/HTTP 200 не подтверждают работу микрофона, WebGPU, видеокадров или мобильную производительность на физическом устройстве.
- PR остаётся draft; merge, production deployment, изменения QQCross и APK не выполнялись.


## Обновление 18 ноября 2026 — локальный Vision в браузере

### Реализация

- Добавлен отдельный Web Worker `src/workers/local-vision.worker.ts` на Transformers.js; он не загружается в основной чат до явного действия пользователя.
- Используется открытая модель `HuggingFaceTB/SmolVLM-256M-Instruct` из модели-карты Hugging Face (Apache 2.0): [модель и описание](https://huggingface.co/HuggingFaceTB/SmolVLM-256M-Instruct).
- Выбирается квантованный WebGPU-вариант `q4f16` при наличии `shader-f16`, иначе `q4`. По текущим опубликованным файлам весов ориентировочный объём модели — около 190–270 МБ, дополнительно загружаются служебные файлы процессора и токенизатора.
- Загрузка запускается только отдельной кнопкой. Прогресс показывается в интерфейсе. Фото и выбранные видеокадры передаются в Worker как data URL и не отправляются на сервер в локальном режиме.
- Для локального видео используются до четырёх равномерно распределённых кадров; звуковая дорожка не анализируется.
- В режиме Online при настроенном облачном Vision используется облачный маршрут; если он не настроен и пользователь явно загрузил локальный модуль, вложения обрабатываются локально. В режиме Offline используется только локальный модуль.
- `/api/capabilities` теперь разделяет состояние облачного Vision и локального браузерного модуля: `imageUnderstanding`/`videoUnderstanding` описывают облачный сервер, `localVision` сообщает об интеграции WebGPU-модуля и его ограничениях.

### Ограничения и проверки

- SmolVLM-256M — очень небольшая англоязычная модель. Русский текст, OCR, мелкие детали, таблицы, формулы и сложные изображения могут распознаваться с ошибками; этот модуль нельзя считать эквивалентом сильной облачной Vision-модели.
- GitHub Actions run `44326427294`: SUCCESS — 6/6 Game AI tests, 59/59 online/search/media/memory tests, TypeScript и production build.
- Vercel preview `dpl_BecDsdZypcKpgNdcrXvyUBopNPjm` — READY на коммите `acc750110a738aefe6e9c4212f41c84b3176f8f4`.
- Preview root, `/api/capabilities` и опубликованный Worker JS asset вернули HTTP 200.
- Это подтверждает публикацию приложения и Worker, но **не подтверждает скачивание ONNX-весов, создание WebGPU-сессии и успешную генерацию** в мобильном браузере.
- Физический запуск на Honor 400 не проводился. Совместимость GPU/браузера, объём памяти, прогрев модели, реальная задержка и качество русского OCR остаются открытыми.
- QQ AI Online, серверная Vision-модель, анализ звука и полноценная мультимодальная модель не подключены.


## Обновление 18 ноября 2026 — локальное распознавание русской речи

### Реализация

- Добавлен отдельный Web Worker `src/workers/local-speech.worker.ts` на `@huggingface/transformers`.
- Используется мультиязычная ONNX-модель `onnx-community/whisper-tiny`, основанная на Whisper Tiny и совместимая с Transformers.js. Модель поддерживает мультиязычную расшифровку; русский задаётся явно параметром `language: "russian"`. Для загрузки задан квантованный режим `dtype: "q8"`, а не зависимость от значения по умолчанию библиотеки. [Карточка модели и пример Transformers.js](https://huggingface.co/onnx-community/whisper-tiny).
- Worker запускает ASR через WebGPU. В браузере Transformers.js по умолчанию использует квантованные варианты моделей; опубликованные файлы Whisper Tiny включают квантованные decoder/encoder компоненты. Ориентир первой загрузки — примерно 70–90 МБ вместе со служебными файлами; точный объём зависит от набора файлов и кэша браузера. [Состав и размеры ONNX-файлов](https://huggingface.co/onnx-community/whisper-tiny/tree/main/onnx).
- Загрузка модели запускается только по явному нажатию. Модель кэшируется библиотекой браузера после загрузки; сама запись пользователя в кэш и базу данных не сохраняется.
- Запись микрофона запускается после разрешения пользователя, автоматически ограничивается 20 секундами и прекращается вручную либо по таймеру. MediaRecorder формирует временный blob в памяти; AudioContext декодирует звук, код преобразует каналы в mono и частоту в 16 кГц.
- В Worker передаётся только временный Float32 audio buffer. После распознавания буфер обнуляется; сетевой маршрут для аудиозаписи не используется. На сервер не отправляются исходная запись или транскрипт самим модулем распознавания.
- Расшифровка добавляется в черновик сообщения, не отправляется автоматически и остаётся редактируемой. Браузерный SpeechRecognition сохранён как альтернативный путь; его аудио может обрабатываться браузерным удалённым сервисом.

### Проверки и ограничения

- GitHub Actions run `44329282854`: SUCCESS — Game AI 6/6, online/search/media/memory/voice 62/62, dataset validator 4/4, TypeScript и Vite production build.
- Добавлены тесты нормализации и resampling audio: stereo → mono, 48 kHz → 16 kHz, проверка лимита длительности, корректное добавление транскрипта в черновик и статические ограничения локального пути.
- В production build включён отдельный Worker bundle; наличие bundle не означает, что Whisper-веса уже скачаны или что WebGPU inference выполнен.
- Локальный путь требует WebGPU, разрешения микрофона, MediaRecorder и декодирования поддерживаемого браузером audio контейнера. Если браузер не поддерживает эти API или WebGPU, пользователь может использовать обычное браузерное распознавание либо вводить текст.
- Whisper Tiny — компактная модель; точность русской речи, имён, пунктуации и длинных фраз может уступать более крупным системам. Текст нужно проверить перед отправкой.
- Не проведён физический тест на Honor 400: поддержка WebGPU, загрузка весов, работа микрофона, скорость распознавания и расход памяти не подтверждены на устройстве.
- Локальная запись ограничена 20 секундами на одно нажатие. Разговор в реальном времени/постоянное прослушивание и анализ звука видеороликов не реализованы.
- QQ AI Online text endpoint и облачная Vision-модель остаются `unconfigured`; это локальный голосовой модуль, а не полнофункциональный облачный голосовой диалог.
