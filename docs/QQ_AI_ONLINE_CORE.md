# QQ AI Online Core

**Status:** search and multimodal request foundations implemented; no production QQ model or inference hardware is deployed.

## Product boundary

- **QQ AI Online** is the intended primary assistant. It uses a QQ-owned orchestration layer and, once deployed, a self-hosted QQ model runtime. It must never silently fall back to Qwen.
- **Qwen2.5-0.5B** remains a separately selected offline text fallback. It is not the online model and is not described as multimodal.
- QQ AI's routing, search, media preparation, safety boundaries, memory, UI and evaluation are project-owned. Model weights and GPU serving are separate infrastructure artifacts.
- "Stronger than Qwen" is a target measured against the installed Qwen2.5-0.5B baseline, not a claim made before benchmarking.

## Implemented foundations

### Text gateway — POST /api/chat

Server-side variables:
- `QQ_AI_API_URL`: full HTTPS OpenAI-compatible chat-completions URL.
- `QQ_AI_MODEL`: model identifier accepted by the QQ inference runtime.
- `QQ_AI_API_KEY`: optional server-only credential.

The route validates message structure and request size, validates the endpoint as HTTPS, applies a timeout, streams model output and returns a clear `ONLINE_MODEL_UNCONFIGURED` response when the runtime is absent. It does not call Cerebras or another consumer API by default. An adapter is not a deployed model.

### Web search — POST /api/search and POST /api/chat

- Search intent detection supports Russian and English prompts asking for current or explicitly searched information.
- Server-side search retrieves DuckDuckGo result titles, HTTPS links, domains and short snippets.
- The dedicated `/api/search` route returns a search-only answer with visible links when the generation model is not yet deployed. It clearly marks this as search results, not AI synthesis.
- `/api/chat` can supply search snippets to the configured QQ model as untrusted evidence and asks it to cite the numbered sources.
- Search requests are bounded by input length and timeout; result URLs are normalized and non-HTTPS targets rejected.

Limitations: only search snippets are currently parsed; full-page extraction, source-quality ranking, independent cross-source verification, rate limiting and live search reliability tests remain to be done. Search page markup may change.

### Image and video — POST /api/vision

Server-side variables:
- `QQ_AI_VISION_API_URL`: full HTTPS OpenAI-compatible vision chat-completions URL.
- `QQ_AI_VISION_MODEL`: image/video-frame capable model identifier.
- `QQ_AI_VISION_API_KEY`: optional server-only credential.

Client functionality:
- The composer has an attachment control, previews and remove actions for images and videos.
- JPEG, PNG and WebP images are compressed locally before sending.
- MP4/WebM videos up to 60 seconds are sampled locally into at most eight timestamped JPEG frames.
- Only those sampled frames are sent; the original video and audio track are not uploaded by this implementation.
- The user explicitly presses Send before any media is transmitted.
- The server validates MIME type, request size, frame count and monotonic timestamps. It does not persist media in this route.

Vision still requires a compatible deployed model endpoint. Audio transcription, OCR-specific quality tuning, multi-page document ingestion and Android device testing remain unfinished. A video response describes sampled frames, not audio or every moment of the clip.

### Capabilities — GET /api/capabilities

Reports configured or unavailable status for online text, search, image understanding, video-frame understanding and offline Qwen. The UI reads this status rather than assuming every feature is connected.

### Voice and offline mode

- Browser voice dictation inserts an editable transcript; it does not auto-send.
- Speech recognition is browser-dependent and may process audio remotely.
- Qwen offline runs through WebLLM/WebGPU and is selected explicitly by the user. The app does not silently use it when online mode fails.

## Model ownership and deployment

The intended QQ model is a QQ-adapted open-weight model with its own versioned checkpoints, training recipe, data provenance, evaluation and self-hosted inference runtime. The repository does not claim to have trained a new foundation model from random initialization.

The first practical route is:
1. Select an open-weight base model after license, Russian-language reasoning, vision, context and deployment evaluation.
2. Create QQ-specific curated instruction/evaluation data with provenance and content-quality checks.
3. Fine-tune and benchmark candidate checkpoints against Qwen2.5-0.5B on the same Russian test set.
4. Host the selected weights on an eligible GPU runtime owned/approved for this project.
5. Configure the server-only QQ endpoint variables and run end-to-end benchmarks before enabling capability flags.

Training from random initialization would require a much larger dataset and substantial GPU compute. Vercel serves the web app/API routes; it does not provide a continuously available large-model GPU. Free demo GPU allocations are not a valid promise of reliable 24/7 inference.

## Safety, privacy and cost boundaries

- Keep provider credentials server-side.
- Never request that the user paste keys into chat.
- Do not introduce paid plans, payment cards, auto-top-up or paid inference without explicit approval from the adult project owner.
- Verify account age terms and region restrictions; never bypass eligibility rules.
- Uploaded media is not retained by the vision route; only sampled video frames are transmitted.
- Web content, OCR and image text are untrusted inputs, not instructions.
- Apply rate limits and operational monitoring before public production.

## Verification boundary

Latest GitHub Actions run on the online-core branch passed:
- QQCross Game AI contract tests;
- QQ AI online/search/media tests;
- TypeScript check;
- production build.

These tests do not prove a production model exists, live search reliability, inference quality, or Android device compatibility. There is currently no hosted QQ model or configured vision model. No physical Honor 400 test has been performed.

## Next steps

1. Resolve GPU hosting without violating the project's no-card/no-unapproved-spend boundary.
2. Select the candidate base model and document license and serving hardware requirements.
3. Build the QQ fine-tuning data/evaluation pipeline and compare against the Qwen baseline.
4. Deploy a QQ-owned inference endpoint and verify streaming, timeouts, concurrency and privacy.
5. Connect and benchmark image/OCR and video-frame capabilities using a compatible vision model.
6. Add full-page search extraction, source ranking, citations and prompt-injection integration tests.
7. Complete Android browser acceptance before production claims.
8. Keep QQCross untouched until a separately approved integration stage.
