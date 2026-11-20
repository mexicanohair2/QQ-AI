# QQ Quantum + QQ-AI integration status

Updated: 2026-11-21

## Scope and safety boundary

This work is isolated to the branch feature/qq-quantum-dual-mode in mexicanohair2/QQ-AI. QQCross and Quantum-AI are not modified. The default branch and production deployment have not been changed.

Natural-language text generation is intended to use only QQ Quantum's own weights. No OpenAI, DeepSeek, Qwen, or other third-party text model fallback is permitted. Search and media are separate tools and must be identified as such.

## Offline mode

- The former Qwen WebLLM text engine is replaced at build time by a QQ Quantum Web Worker.
- The user imports the official standalone QQ_Quantum_Offline.html file.
- Asset parsing validates the file and extracts JSON without evaluating the HTML's JavaScript.
- Model assets are stored in IndexedDB.
- Tokenization and inference run in the browser worker from the user's own QQ Quantum weights.
- Offline chat and math must not call network APIs. The web search control is disabled and remote browser speech recognition is blocked while Offline is active.
- Existing local Whisper and local Vision tools remain separate opt-in local workers. Their model files must be downloaded locally before use and require supported browser/device hardware.

## Online mode

- api/chat.ts accepts only QQ_QUANTUM_ONLINE_URL and QQ_QUANTUM_ONLINE_TOKEN.
- The route returns 503 when the own model endpoint is not configured; there is no third-party LLM fallback.
- The route performs server-side web search through DuckDuckGo and Bing, and passes only server-generated search context to the model service.
- The experimental server returns sourced snippets (title, domain, URL and excerpt). The model cannot yet reliably synthesize long pages, so the service must not present snippets as a completed website analysis.
- Voice input and image understanding are still separate tools from the text model. QQ Quantum does not yet have native speech or vision weights.

## Build and tests

Last full QQ-AI preview-branch build on Vercel Sandbox:
- Node tests: 6/6 pass
- Online/core tests: 75/75 pass
- TypeScript project check: pass
- Vite production build: pass

Additional QQ Quantum training-core tests: 7/7 pass.
The branch build contains the QQ Quantum worker and does not include the former Qwen model asset.

## CPU training experiment

A Vercel Hobby Sandbox with 1 vCPU and 2 GB RAM was used. CUDA was unavailable and not used.

- Training steps: 1,000
- Architecture: decoder-only Transformer, 2 layers, 4 heads, embedding 128
- Batch size 8; block size 128; tokenizer target vocabulary 512
- Corpus: 25,626 characters / 11,223 tokens
- Train / validation: 10,100 / 1,123 tokens
- Training loss: 3.12546 at step 500; 2.19359 at step 1,000
- Validation loss: 3.50174 at step 500; 3.42858 at step 1,000
- Corpus SHA-256: 7ebdfde595b94ebac8f891131cfa8c3834ff683679e09f3510ea7d1944073efc

The checkpoint was loaded by the experimental API. Exact corpus Q&A works. Free-form generations remain low quality and are deliberately rejected by a quality guard when they do not meet a basic grounding/diversity check. This is a research prototype, not yet a capable general assistant.

## Deployment blocker

The existing Vercel project qq-ai-preview currently has no Git repository connected. Vercel's API rejected the attempt to create branch-scoped Preview environment variables because the project is not connected to Git. Creating a Git-linked Vercel project also failed because the Vercel GitHub App has not been installed for the GitHub account/team.

No Preview deployment was created, no Production deployment was changed, and no project environment variables were added. To finish the Preview integration, install/authorize Vercel's GitHub App for mexicanohair2/QQ-AI and connect the feature branch to a Vercel Preview project.

The Python inference endpoint was tested inside a temporary Vercel Sandbox. It is not a durable production service and must not be treated as the final online endpoint. The checkpoint needs to be placed in durable model storage or deployed with an appropriate persistent inference service before public use.
