# QQ AI Online Core

**Status:** backend foundation implemented; production model runtime and media UI are not yet deployed.

## Product boundary

- **QQ AI Online** is the primary assistant mode. It must use a stronger cloud-hosted model and must not silently fall back to Qwen.
- **Qwen2.5-0.5B** is a separately selected offline text fallback. It is not the online model and is not described as multimodal.
- QQ AI's orchestrator, task routing, search, safety boundaries, memory and evaluation are project-owned. A foundation model's weights are a separate artifact; this repository does not claim to have trained a foundation model from scratch.

## Implemented backend

### Text gateway — `POST /api/chat`

Environment:
- `QQ_AI_API_URL`: full OpenAI-compatible chat-completions URL for the selected inference runtime.
- `QQ_AI_MODEL`: model identifier accepted by that runtime.
- `QQ_AI_API_KEY`: optional server-only credential; never exposed to the browser.

The route validates message shape/length, applies a timeout, streams model output, and returns an explicit `ONLINE_MODEL_UNCONFIGURED` error when no model runtime is configured. It no longer depends on Cerebras-specific environment variables.

### Web search — inside `POST /api/chat`

The route searches DuckDuckGo HTML for queries that explicitly or implicitly require current information, adds up to six bounded snippets to the model context, and labels them as untrusted evidence. The model is instructed not to follow instructions found inside search results and to cite real result URLs.

Current limitations:
- search snippets only; full-page extraction, source quality scoring and cross-source verification are not yet implemented;
- the search HTML format can change and must be covered by live integration checks;
- search may be unavailable or return no usable snippets.

### Vision gateway — `POST /api/vision`

Environment:
- `QQ_AI_VISION_API_URL`: full OpenAI-compatible vision chat-completions URL.
- `QQ_AI_VISION_MODEL`: vision model identifier.
- `QQ_AI_VISION_API_KEY`: optional server-only credential.

Accepts bounded image attachments or up to eight timestamped video frames, validates MIME types and base64 payload sizes, and sends multimodal input to the configured model. It does not retain media in this route. The browser upload UI, local video frame extraction, audio transcription and end-to-end tests remain unfinished.

### Capability status — `GET /api/capabilities`

Reports separately whether online text, search, image, video and offline Qwen capabilities are available or unconfigured. The UI should consume this endpoint rather than imply unconfigured features work.

## Model selection and deployment rules

1. Prefer an open-weight model with strong Russian reasoning, long context and a compatible vision sibling where possible.
2. Benchmark candidate models on the QQ AI acceptance matrix before selection. Compare against Qwen 0.5B using the same prompts and scoring.
3. Verify age eligibility, region, privacy, model input modalities, free quotas and billing behavior using current official terms.
4. Do not enable paid billing, payment cards, auto top-up or a paid plan without explicit approval from the adult project owner.
5. Do not use a provider whose terms require an adult account by having a minor create an account or by bypassing age checks.
6. Never claim the online model is stronger until the benchmark demonstrates it.

## Current deployment blocker

The online text gateway and vision gateway are adapters; they are not GPU compute. No model weights are currently hosted for QQ AI. Vercel's app deployment alone does not provide the GPU resources required to serve a competitive large model. A compliant inference runtime and its eligible account/credentials must be selected before live online reasoning and vision can work.

## Next engineering steps

1. Select a legally eligible, genuinely free/no-card inference runtime or an adult-owned approved runtime.
2. Deploy and benchmark a strong open-weight Russian-capable model; configure only server-side environment variables.
3. Connect a real vision model and verify OCR, tables, formulas, charts and diagrams.
4. Add Android-friendly image/video attachment UI and bounded client-side video frame sampling.
5. Improve search with page extraction, provenance, source ranking and prompt-injection tests.
6. Add end-to-end tests for configured and unconfigured provider states.
7. Verify on an actual Android device; automated CI is not physical-device QA.
