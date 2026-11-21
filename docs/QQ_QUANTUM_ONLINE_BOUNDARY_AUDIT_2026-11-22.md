# QQ Quantum — online generation boundary audit

**Date:** 2026-11-22  
**Branch:** `feature/qq-quantum-dual-mode`  
**Scope:** primary text chat, inference package and adjacent optional model adapters

## Primary text route — verified as QQ-owned inference

The ordinary online text-chat request follows this path:

1. `api/chat.ts` validates the message list and removes client-supplied system messages.
2. When a web search is requested, it retrieves snippets from DuckDuckGo and Bing and returns those search results as sourced excerpts. This route does not submit the question to a third-party text-generation model for synthesis.
3. For ordinary conversation, the route calls `answerWithQuantum(messages)` from `src/lib/qq-quantum-server.ts`.
4. The QQ Quantum runtime loads the pinned server-side `server/quantum/model.json` package, reconstructs the project-owned byte-level BPE tokenizer and `QuantumBrowserModel`, then calls `runtime.model.generate(...)`.
5. If the generated text fails the current grounding checks, the runtime returns an explicit uncertainty response. It does not route the answer to OpenAI, DeepSeek or another LLM.

A regression test now asserts this boundary: the main chat handler must call the QQ Quantum runtime, and neither the handler nor its inference module may import the generic provider gateway or contain third-party LLM credential aliases.

## Currently pinned online weights — verified metadata

The artifact fetched by the build pipeline from the configured default source was inspected directly:

- Package format: `qq-quantum-web-weights-v1`
- Checkpoint format: `qq-quantum-sft-v1`
- Recorded training step: **100**
- Decompressed weight bytes: **2,701,312**
- Vocabulary size: **1,024**
- Embedded corpus size: **104,431 characters**
- Weight SHA-256: `0f533e6057e371f1967a5aedb34ddef1e1ffad80db5b8a5b5936ede75abd2cc5`

The hash and step match the committed online artifact manifest. This confirms package integrity and the identity of the artifact currently pinned by the application; it does not establish assistant quality. The earlier held-out checkpoint audit found that the current model family did not pass the free-generation evaluation. No medium-model or production-quality claim is justified.

## Separate adapters — not the primary QQ Quantum generator

The repository also contains separate routes that must not be confused with the main text model:

- `api/vision.ts` can call a separately configured, Chat Completions-compatible Vision provider. Its supported provider endpoint and credential are external configuration. This is not a QQ Quantum-owned Vision model and is not used by `api/chat.ts` to generate ordinary text answers.
- `api/game-assistant.ts` calls a separately configured generic model endpoint for a game-assistant workflow. It is outside the primary QQ Quantum text-chat path and must not be represented as a QQ Quantum-owned game model.
- The optional local Vision runtime names a third-party model. It is not the QQ Quantum Transformer and is not evidence of a from-scratch visual model.

These adapters are separate optional integrations, not fallbacks for QQ Quantum text generation. They are not counted as completed capabilities of an independently trained QQ Quantum model. Any future use as part of QQ Quantum's own seven-direction capability set requires a separate explicit decision and acceptance tests.

## Outstanding blockers

1. The serving checkpoint is a small experiment at training step 100, not a medium-capability model.
2. Current training hardware is CPU-only with 1 vCPU and 2 GiB RAM; this cannot support meaningful medium-model pretraining.
3. The existing corpus is only 104,431 characters / 13,880 words. Its sidecar manifest correctly marks origin/license, factuality and privacy review as pending.
4. The optional Vision/game integrations are not owned QQ Quantum models and must remain clearly separated.
5. Each capability direction still needs its own implementation and measurable acceptance tests. A route, button or configured external provider is not sufficient.

## Verification

- Primary chat/runtime path inspected in source.
- Served artifact fetched, decompressed and checked against its recorded size and SHA-256.
- A static regression test was added to the online-core test suite for the primary text-generation boundary.
- Repository CI is the final gate for this audit commit.
