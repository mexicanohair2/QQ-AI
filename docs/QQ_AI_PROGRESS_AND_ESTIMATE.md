# QQ AI — progress and realistic delivery estimate

Last verified: 2026-11-18. This document describes the feature branch preview, not a production release.

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
