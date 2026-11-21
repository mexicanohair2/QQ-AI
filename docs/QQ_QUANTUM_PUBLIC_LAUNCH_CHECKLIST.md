# QQ Quantum — public website launch checklist

Last checked: 2026-11-21

## What already works

- The QQ Quantum frontend and `/api/chat` gateway are implemented in the `feature/qq-quantum-dual-mode` branch. A Vercel Preview is live at https://qq-ai-preview-git-feature-qq-quantum-dual-mode-mexicanohaie.vercel.app/.
- The gateway only forwards text generation to a separately hosted QQ-owned model endpoint. It has no third-party language-model fallback.
- The private Python inference service runs the project's own decoder-only Transformer and byte-level BPE tokenizer.
- The private service requires a bearer token, rejects invalid requests, and exposes a health endpoint.
- The current selected experimental checkpoint is `model-dialogue-v4-sft-refine-best` (6.27 MiB). It is deliberately not committed to this public repository.
- Unknown questions fail closed instead of returning ungrounded generated text.

## Browser-owned QQ Quantum mode

- The web app now has a separate Quantum mode. It does not reuse the legacy offline model or silently fall back to a third-party LLM.
- Selecting Quantum automatically downloads the model from the website static assets (`/quantum/manifest.json` and `/quantum/model.json`) on the first launch. The browser validates the model format and SHA-256 weights, saves it into IndexedDB, and runs it in a dedicated worker. No HTML file is required.
- The model package is approximately 3.4 MiB for the currently selected experimental checkpoint. It includes the model weights, tokenizer, and the authored knowledge corpus.
- The selected SFT checkpoint uses the qq-quantum-sft-v1 format. The exporter supports both pretraining and SFT checkpoints and uses the shared completed-step counter so SFT metadata is not off by one.
- The model asset is served by the Vercel Preview at `/quantum/model.json` (3,564,623 bytes). Its gzip-decoded weights are 2,701,312 bytes and match SHA-256 `0f533e6057e371f1967a5aedb34ddef1e1ffad80db5b8a5b5936ede75abd2cc5`. The model asset is deployed with the site; it is not committed to the public Git repository.
- After the first download, browser storage is per browser/device and is not synced through the website. If local browser storage is cleared, the site downloads the model again.

## Remaining blockers for Online mode and production launch

1. **A durable public inference host is not connected.** The current Python API is running only in a temporary private development sandbox. That URL is not a production endpoint.
2. **The model checkpoint must be transferred to protected server storage.** The GitHub repository is public, so model weights are not silently added to it. The checkpoint must be placed in a private deployment volume or another protected artifact store.
3. **A long-running Python service must be deployed.** Vercel's existing static frontend/API preview is not a persistent PyTorch model host.
4. **The Vercel project needs two server-side environment variables:** `QQ_QUANTUM_ONLINE_URL` (HTTPS URL of the inference service) and `QQ_QUANTUM_ONLINE_TOKEN` (a random secret of at least 32 bytes). These must never be exposed to browser code.
5. **The deployed preview must pass live end-to-end tests** from the public website, including mobile browser use, authenticated model requests, unknown-question refusal, timeout behavior, and abuse controls.

## Hosting status

- No Railway project is currently connected to the account, so no Railway service has been created and no paid hosting has been provisioned.
- The Vercel development sandbox is temporary and must not be treated as a production server.
- The feature-branch Preview is live and serves the browser-owned model for one-tap download. The production website has not been switched; the real Android device flow and actual model responses still need hands-on verification.
- QQCross has not been modified.

## Runtime configuration

The Python service now reads `HOST`, `PORT`, and `QQ_QUANTUM_TORCH_THREADS` from the environment, defaults to one CPU thread, and refuses to start with a bearer token shorter than 32 bytes. The default model path points to the selected experimental checkpoint; the generated curriculum corpus path is used by default. Deployment must provide the checkpoint and build the generated corpus before starting the service.

## Launch acceptance gate

The public chat is considered launched only after all of the following are true:

- the inference host has a stable HTTPS domain and persistent model storage;
- `/health` reports `ready` for the intended checkpoint;
- unauthenticated inference returns HTTP 401;
- the Vercel `/api/chat` route successfully proxies to the QQ endpoint without exposing the token;
- a real browser session can send and receive messages on the website;
- the mobile layout, refresh, error states, and conversation history are verified;
- the deployment is monitored and the public URL is confirmed.

Until then, the website is a preview and the model API is private/experimental.
