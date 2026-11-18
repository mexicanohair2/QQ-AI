# QQ AI Online Core

## Product contract

QQ AI has two deliberately separate execution modes:

- **QQ AI Online** is the intended high-capability assistant. It will use the project's own hosted inference service, with reasoning, retrieval, web search, image understanding, and timestamped video-frame analysis.
- **Qwen Offline** is a local fallback for text tasks when the user has downloaded the model. It is not silently substituted for the online model, and it is not presented as a vision or web-search system.

The online assistant must not be described as stronger than the offline baseline until the Russian evaluation matrix has been run against both models.

## What this implementation adds

- A provider-neutral QQ AI online request contract.
- Search intent detection for explicit requests for current information.
- A server-side DuckDuckGo HTML search adapter that returns sanitized HTTPS result URLs, titles, snippets, domains, and retrieval timestamps.
- A search-only response when search succeeds but the online model is not deployed. This is deliberately labelled as search results, not as a generated AI answer.
- A self-hosted, OpenAI-compatible inference endpoint contract using server-only variables:
  - QQ_AI_MODEL_URL — full HTTPS URL ending in /v1/chat/completions.
  - QQ_AI_MODEL_NAME — exact model name expected by the deployed inference server.
  - QQ_AI_MODEL_TOKEN — optional bearer token for the private QQ inference service.
  - QQ_AI_MODEL_SUPPORTS_VISION=true — explicit operator declaration that the selected model endpoint has been verified to accept image inputs.
  - QQ_AI_MODEL_SUPPORTS_VIDEO_FRAMES=true — explicit declaration that video has been sampled into timestamped image frames and the selected model has passed the video-frame benchmark.
- /api/status, which reports configured capabilities without exposing endpoints, tokens, or other secrets.
- Server-side validation, bounded request/media sizes, same-origin checks, abort timeout, and normalized errors.

## Current limitation

The repository does not yet contain trained QQ model weights or a deployed QQ inference server. Therefore ordinary online generation and vision inference remain unavailable until the project's own inference service exists and its protected variables are configured. The app must never claim that a generic text endpoint can interpret images or video.

A configurable endpoint is an integration boundary, not a claim that the model has already been trained. No external provider is silently substituted.

## Model development direction

The target is a QQ-owned model release: choose a permissively licensed open-weight base after Russian-language, reasoning, vision, latency, and deployment evaluation; then build QQ-specific instruction data, supervised fine-tuning, and preference/evaluation loops. Keep an auditable record of base-model license, training-data provenance, training recipe, checkpoints, and benchmark results.

Training a new foundation model from random initialization is a separate research effort requiring substantial GPU compute and curated data. The first practical route is a QQ-adapted model with owned checkpoints and a self-hosted inference service, not an untrained transformer and not a hidden dependency on a consumer API.

## Search behavior

Search is performed server-side. Only the search results' visible titles, snippets, and URLs are used in the first iteration; destination pages are not fetched or represented as read. Search snippets and titles are untrusted data and cannot override model instructions. When no QQ model is deployed, search results are displayed as links and excerpts without pretending to synthesize or verify their full contents.

## Privacy and media

Images are sent only after the user presses Send in Online mode. Video is sampled locally into a small bounded set of timestamped frames; the original video file and its audio track are not uploaded by this implementation. Raw media is not persisted by the route. The online model must pass the relevant image/video acceptance tests before those capabilities are advertised as available.

## Verification boundary

Automated tests validate request-side utility functions and search-result parsing. They do not prove search-engine uptime, model quality, inference availability, Android browser compatibility, or production-scale rate limiting. A real QQ inference service and end-to-end device test remain separate acceptance gates.
