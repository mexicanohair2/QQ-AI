# QQ Quantum integration status

Updated: 2026-11-21

## Active scope: online only

All current product work is limited to the online QQ AI experience. The interface no longer exposes the Offline selector, local text-model download, local Vision download or local Whisper download. Those implementations remain dormant for a later phase. QQCross and the repository default branch are not changed.

## Online architecture

- The browser loads the QQ AI application only. It does not request or cache model weights.
- During the build, `scripts/fetch_qq_quantum_model.mjs` fetches the pinned model artifact into `server/quantum/model.json` and verifies it against the committed SHA-256 manifest. The file is generated locally for server bundling and is never committed or exposed as a public static asset.
- `api/chat.ts` runs on the default Vercel Node.js runtime and imports the project's own inference engine and model package.
- The server inflates and validates the weights once per warm function instance. There is no user upload, manual import, or client-side model download.
- There is no OpenAI, DeepSeek, Qwen, or other third-party language-model fallback.
- The `/api/capabilities` endpoint reports the bundled QQ Quantum service as configured. `/api/status` is an explicit alias to the same handler.
- Web search is a separate tool. Search requests return actual result titles, URLs, domains and snippets. They are not presented as a model-written synthesis of pages.
- Browser speech recognition is optional. Native QQ Quantum speech and vision models are not connected; the attachment control remains hidden until a Vision service is configured.

## Current model and quality lim¶»§q«^