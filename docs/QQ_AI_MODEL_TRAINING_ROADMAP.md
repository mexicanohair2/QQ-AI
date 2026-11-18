# QQ AI — model ownership and training roadmap

## Target

QQ AI Online must be a project-owned model release, not a user-facing wrapper that silently forwards every request to a consumer chatbot. The target is a QQ-adapted model with its own versioned weights/checkpoints, training recipe, evaluation history, and a self-hosted inference service.

QQ AI Offline remains the separate local Qwen model. Online and offline model IDs, status, and routing must never be conflated.

## What “our own model” means in the first practical release

A foundation model trained from random initialization is not a realistic first milestone without a large curated corpus and a substantial GPU cluster. The first QQ-owned model should therefore be built by:

1. Selecting a permissively licensed open-weight base only after license, Russian quality, context length, reasoning, vision, and deployment review.
2. Recording the exact upstream revision and license obligations.
3. Creating QQ-authored instruction examples and licensed/consented training data. Never use private chat history, uploaded files, or personal knowledge collections as training data by default.
4. Supervised fine-tuning the base into a QQ checkpoint; preserve dataset manifests, training configuration, random seed, adapter/checkpoint hashes, and evaluation outputs.
5. Applying preference optimization only after a reliable preference dataset and independent review process exist.
6. Exporting a quantized inference artifact and serving it from QQ-controlled infrastructure.
7. Running the Russian benchmark against the unchanged Qwen offline baseline and at least one suitable open-weight candidate.

The base model is a disclosed technical ancestor; the QQ fine-tuned checkpoint, instruction behavior, evaluation suite, orchestration, and release process are the project's own maintained assets. Do not claim that a model was trained from scratch if it was adapted from existing weights.

## Capability tracks

### Online text and reasoning
- Prioritize Russian instruction following, multi-step reasoning, long-context reading, mathematical explanation, and factual calibration.
- Keep arithmetic and exact calculations deterministic where possible.
- Add retrieval and web research as tools; tool availability is not a substitute for reasoning quality.
- Benchmark latency, first-token time, completion time, memory, and cost per request.

### Vision
- Select a vision-language base with a verified image API and compatible license.
- Evaluate OCR, handwriting, tables, equations, charts, screenshots, and ordinary photos.
- If vision is a separate model, route images to it explicitly and let the text model synthesize only returned evidence.
- Never report image support merely because an endpoint accepts a data URL.

### Video and audio
- Video v1 analyzes a bounded set of timestamped frames. It must not claim to understand every frame.
- Audio transcription is a separate model and consent flow. It is not implemented by frame sampling.
- A future multimodal model may unify these paths only after independent acceptance tests.

## Compute and deployment gate

The repository and Vercel preview do not supply persistent GPU inference. Model weights cannot be made into a strong online assistant merely by adding TypeScript routes. Before training or hosting:
- Identify an age-compliant, region-supported compute path.
- Confirm that a no-card/free allowance is actually sufficient for the intended test, not just a temporary trial.
- Measure GPU RAM, model size, throughput, cold starts, concurrency, storage, and egress.
- Obtain explicit adult project-owner approval before any paid plan, payment method, or usage that can incur charges.
- Keep the inference host private or protected; never expose model credentials to the browser.

No hosting vendor is selected in this roadmap. Do not create accounts, accept terms, or incur spend on the user's behalf.

## Release gates

- **Model candidate:** license and deployment reviewed; exact model ID and revision recorded.
- **QQ checkpoint:** training dataset provenance and recipe documented; checkpoint hash retained.
- **Benchmark:** same Russian prompts run against QQ and offline Qwen; quality is scored blind against rubrics and references.
- **Vision/video:** real end-to-end tests pass with media payloads and timestamped outputs.
- **Hosted service:** latency, error handling, privacy, rate limits, authentication, and operational cost measured.
- **Product claim:** say QQ AI is stronger than Qwen only after benchmark results support that claim.

## Current status

As of this document, QQ AI has a provider-neutral online gateway, search-result retrieval, media UI/preparation, and a vision gateway contract. No QQ model weights have been trained, no QQ inference GPU has been provisioned, and live online generation/vision are not yet configured. The benchmark harness prepares evaluation; it does not itself prove model quality.

## Candidate to evaluate first (not yet selected)

A concrete first candidate is **Mistral AI Ministral 3 8B Instruct**:

- Official model card: https://huggingface.co/mistralai/Ministral-3-8B-Instruct-2512
- Official Mistral model documentation: https://docs.mistral.ai/models/ministral-8b-latest
- License: Apache 2.0, as stated by Mistral and the model card.
- It is an 8B-class instruction model with native image understanding and a documented 256k context window.
- Mistral's language documentation explicitly includes Russian among supported languages: https://docs.mistral.ai/resources/languages
- Mistral's vLLM instructions recommend an H200-class GPU for the documented full-precision/FP8 serving path. The 8B checkpoint file shown on Hugging Face is about 17.8 GB before runtime memory, KV cache, and vision overhead.

This is a **candidate for controlled evaluation and QQ fine-tuning**, not a final selection and not a currently deployed model. It is substantially larger than the local 0.5B Qwen baseline, but parameter count alone does not prove better Russian reasoning. Run the same benchmark before claiming superiority. Quantized hosting on smaller hardware must be measured rather than assumed.
