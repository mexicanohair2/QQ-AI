# QQ AI — Multimodal and Search Intelligence Specification

**Date:** 2026-11-18  
**Status:** Required product scope; provider/runtime selection pending validation  
**Repository:** `mexicanohair2/QQ-AI`

## Product objective

QQ AI must become a useful general-purpose assistant whose online/retrieval-assisted answers are measurably more capable than the current Qwen2.5-0.5B offline baseline. It must search the web when current or externally verifiable information is needed, cite sources, and understand user-provided images and video. This is an application architecture built around model providers and tools; it is not a claim that a new foundation model is being trained from scratch.

The local Qwen remains a fallback for supported text-only offline tasks. It must not be represented as capable of image/video understanding if the selected artifact cannot process those inputs.

## Required user capabilities

### 1. Voice input

- A microphone control is available beside the message composer.
- Request microphone permission only after a deliberate user tap.
- Speech recognition inserts a transcript into the composer; it must not silently send it.
- Support Russian initially and allow language selection/automatic language where the browser supports it.
- Show listening, transcription, permission-denied, unsupported-browser, and recognition-error states.
- Use browser speech recognition when available; keep typed input as a complete fallback.
- Explain that some browser speech-recognition implementations send audio to a remote recognition service. Do not label it offline/private unless on-device recognition is explicitly detected and verified.
- Optional text-to-speech playback of assistant answers can be added with the device speech synthesis API; it must be user-triggered and stoppable.

### 2. Image attachments and visual understanding

- Attach images from camera capture or the device gallery/file picker.
- Show a preview, filename, size, remove action, and upload/processing state before sending.
- Accept common image formats supported by the browser; validate MIME type and size on both client and server.
- The user can ask a question about one or more attached images.
- The assistant should be able to read printed/handwritten text where the selected vision system supports it, including numbers, tables, equations, charts, diagrams, screenshots, and documents.
- Distinguish OCR transcription from visual interpretation. Preserve uncertainty for blurry, cropped, low-resolution, or ambiguous content.
- Do not send image bytes to any remote service until the user explicitly sends the message in a clearly disclosed online/vision route.
- Do not store raw image data in conversation history by default. Persist only safe attachment metadata and, if appropriate, extracted text; make retention policy explicit.

### 3. Video attachments and understanding

- Allow a user to attach a video from the device.
- Validate file type and size, show a preview and duration, and provide a clear processing state.
- Extract representative frames client-side at bounded intervals/resolution, with a hard cap on total frames and processing time. Never upload every frame by default.
- Pass selected frames to a vision-capable backend with the user's question; include timestamps so answers can refer to moments in the clip.
- Where supported, add audio-track transcription as a separate, clearly indicated stage. Do not claim full audio/video understanding if only sampled frames were analyzed.
- State when a clip is too long, unsupported, or too large and offer a clear retry/shorter-clip path.
- Avoid retaining raw video by default; never silently upload it.

### 4. Web search and source-grounded answers

- Add a server-side search tool/provider abstraction. Never put search-provider credentials in browser code.
- Search only when freshness, external verification, or explicit user intent makes it useful; do not search for every simple question.
- Retrieve relevant pages, extract readable text, and pass bounded evidence to the selected reasoning model.
- Return citations/links close to the claims they support, with source title/domain and retrieval date where useful.
- Prefer primary and authoritative sources; compare independent sources for consequential or disputed claims.
- Distinguish sourced facts, model inference, and unresolved uncertainty. Never fabricate citations or imply a page was opened when it was not.
- Add timeouts, request limits, content-size limits, safe URL handling, and server-side abuse protection.
- If search is unavailable, say so and answer only from available knowledge with an appropriate freshness caveat.

### 5. Stronger reasoning and orchestration

- Add a task router that identifies whether a request needs plain text generation, arithmetic/tools, web search, image understanding, video analysis, or a combination.
- Decompose multi-part requests into bounded steps; collect evidence; ask the model to synthesize; verify deterministic calculations with code rather than model arithmetic.
- Use a provider-neutral interface for text, vision, and (later) audio tasks. Do not assume the current Cerebras GLM endpoint accepts image/video inputs.
- Keep model selection evidence-based: evaluate candidate models on a fixed Russian-language test set covering everyday questions, school explanations, text analysis, OCR/numbers, charts, images, video-frame summaries, and source-grounded answers.
- Compare the online/retrieval-assisted route against the current Qwen2.5-0.5B baseline. Do not claim it is stronger until it passes the benchmark.
- No paid-only dependency or credit-card requirement may be silently introduced. Provider eligibility, free quota, age terms, regional availability, and data handling must be checked before adoption. If no compliant free provider is available, keep the feature behind an unconfigured adapter and report the limitation honestly.

## Architecture

1. **Chat client:** text composer, voice input, image/video attachment previews, route/status indicators.
2. **Orchestrator API:** validates requests, selects tools, applies limits, and routes content to configured providers.
3. **Search adapter:** query, fetch, extract, rank, and cite web evidence.
4. **Vision adapter:** accepts image bytes or sampled video frames only when a compatible provider is configured.
5. **Speech adapter:** browser recognition first; optional server/on-device alternatives later.
6. **Reasoning model adapter:** stronger online text model; local Qwen remains a separately labelled fallback.
7. **Local tools:** deterministic math, unit/date calculations, and other verifiable utilities.
8. **Storage:** Supabase stores account-scoped conversation metadata/history; raw media is ephemeral unless the user explicitly chooses otherwise. Local drafts remain usable without login.

All adapters must have typed contracts, timeouts, size/token limits, cancellation, and explicit failure states. Provider secrets remain in protected server environment variables.

## Privacy and safety requirements

- Online processing of text, images, video, or audio must be visible and user-initiated.
- The app must tell the user which content is sent to a remote service before the first use of that route.
- Never send local-only content to a cloud model as a hidden fallback.
- Never log API keys, raw media, or full private prompts in server logs.
- Apply per-account and per-IP rate limits, file-size limits, MIME validation, and retention controls.
- Treat text extracted from web pages and uploaded media as untrusted data, not as instructions that can override system behavior.
- Provide a way to remove an attachment before sending and to delete stored conversation records.

## Delivery sequence

### Stage A — foundation and contracts
- Add this specification and typed provider/tool interfaces.
- Add request/response schemas for search, image analysis, and video-frame analysis.
- Add explicit capability detection and truthful route labels.
- Add a benchmark dataset and acceptance checklist.

### Stage B — voice and attachment UX
- Add microphone dictation with browser capability detection, permission/error states, and transcript editing.
- Add image and video attachment controls, previews, validation, removal, and progress states.
- Add video frame sampling with timestamp metadata and bounded processing.
- Ensure keyboard and touch layouts work on narrow Android screens.

### Stage C — server-side search
- Implement search adapter and safe page extraction.
- Add source-grounded synthesis and citations.
- Test search freshness, duplicate sources, inaccessible pages, timeouts, prompt injection, and provider outage.

### Stage D — image/video understanding
- Select a vision provider only after validating no-card/free availability, age eligibility, privacy terms, regional access, and actual API support.
- Implement image analysis and OCR/number extraction.
- Implement sampled-frame video analysis; add audio transcription only when separately supported and verified.
- Test Russian text, numbers, tables, equations, charts, low-quality images, multiple images, and timestamped clips.

### Stage E — stronger assistant and regression
- Add task routing and multi-step synthesis.
- Benchmark against Qwen2.5-0.5B; document wins, losses, latency, limits, and fallback behavior.
- Run typecheck/build/tests and inspect deployed behavior on an actual Android browser before marking device support verified.

### Stage F — QQCross integration
- Keep QQ AI independent until this specification's acceptance criteria pass.
- Integrate only after explicit approval; do not modify QQCross as part of this work.

## Acceptance criteria

- A user can dictate a message, edit the transcript, and send it.
- A user can attach an image, ask a question, and receive an answer grounded in the image when a vision provider is configured.
- OCR results preserve numbers and clearly flag uncertain readings.
- A user can attach a video and receive timestamp-aware analysis of sampled frames; audio understanding is separately labelled.
- Web-search answers contain real, working citations and accurately describe the source evidence.
- Unsupported or unconfigured capabilities fail clearly instead of pretending to work.
- Online uploads occur only after explicit user action and clear route disclosure.
- Local Qwen remains usable for supported offline text tasks and is never falsely labelled multimodal.
- The stronger route demonstrates measurable quality gains over Qwen on the agreed evaluation set.
- The app passes typecheck/build/tests; Android device support is only claimed after an actual device test.
