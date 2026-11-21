# QQ Quantum — from-scratch model charter

**Status:** Binding project requirement  
**Project:** QQ AI / QQ Quantum  
**Updated:** 2026-11-21

## Mission

Build QQ Quantum as our own medium-capability neural language model, developed collaboratively by the project owner, ChatGPT, and DeepSeek. The model must be trained from random initialization. It is not a wrapper around another model and is not a fine-tune of a third-party foundation model.

## Absolute model-ownership rules

1. Initialize all QQ Quantum trainable weights randomly.
2. Use our own model architecture, tokenizer, training loop, checkpoint format, inference runtime, and evaluation harness.
3. Do not use Gemma, Qwen, Llama, DeepSeek, or another pretrained LLM as the base model.
4. Do not import third-party pretrained weights, LoRA/adapter weights, or a distilled third-party model.
5. Do not silently route prompts to an external generative model. QQ Quantum generates the answer itself.
6. External web search and factual-data retrieval are allowed as tools. They return evidence and source links; QQ Quantum remains responsible for reasoning and writing the answer.
7. Implement and test all seven agreed capability directions:
   - search and information processing (web search, page reading, summarization, source comparison, dates, links, uncertainty);
   - background tasks (scheduled/periodic tasks, monitoring, notifications where the platform truly supports them);
   - help with work, study, and everyday tasks (explanations, calculations, planning, document analysis);
   - text work (writing, editing, proofreading, translation, structuring, summarization);
   - photo and video understanding/processing, limited to formats and operations actually implemented;
   - natural conversation (text dialogue; voice input/output only where genuinely supported);
   - dialogue continuity (current-session context and user-controlled memory across sessions).
   Each direction needs its own tests and measurable acceptance criteria; a UI button alone does not count as implementation.
8. Work on the separate QQ-AI repository and feature branch. Do not change QQCross or integrate into it until the QQ Quantum module has passed its gates and the owner explicitly authorizes integration.
9. The active product stage is online-only. Offline/browser weight downloads remain deferred.
10. Do not enable paid GPU services or paid APIs without explicit approval.

## Current verified technical baseline

The repository contains a project-owned decoder-only Transformer in `qq_quantum/model/transformer.py`, a project-owned byte-level BPE tokenizer in `qq_quantum/model/tokenizer.py`, and a reproducible training/checkpoint pipeline in `qq_quantum/model/training.py`.

The 2026-11-21 CPU smoke report records:
- a from-random-initialization model with 31,200 parameters;
- 500 optimizer updates and a valid save/reload/generation cycle;
- validation loss reduction from 6.2459 to 4.3778;
- visibly incoherent generated Russian text.

A separate experimental checkpoint is recorded at 478,720 parameters (2 Transformer layers, 4 heads, width 128). Its HTTP/authentication and retrieval path was smoke-tested, but it is not a capable free-form conversational model. Neither checkpoint qualifies as the target medium model.

These facts must remain visible in reports. Do not describe either checkpoint as production-ready or medium-sized.

## Definition of the medium-model target

“Medium” is a capability target, not a marketing label. Before scaling training, complete a compute-feasibility gate that specifies:
- candidate parameter-count range for our own architecture;
- context window and memory requirements;
- tokenizer vocabulary and expected training-token count;
- training hardware, realistic throughput, checkpoint storage and recovery;
- inference latency and serving-memory budget;
- a six-week milestone plan with explicit no-cost constraints.

Do not pick a parameter count solely because it sounds impressive. Select a size that can be trained from scratch with the compute actually available, and record the trade-offs. If available compute cannot support the target in the agreed time, report the blocker rather than quietly switching to pretrained weights.

## Training stages

### 1. Data and tokenizer
- Build a broad, reviewed, legally usable Russian-first corpus with balanced general knowledge, dialogue, reasoning, mathematics, coding, and instruction-following examples.
- Keep evaluation prompts isolated from all training and tokenizer-fitting data.
- Do not train on private chats or personal user files.
- Train and version the QQ byte-level BPE tokenizer on the training split only.

### 2. Base pretraining
- Initialize the QQ Transformer randomly.
- Train next-token prediction over the approved corpus.
- Track train and validation loss, tokens/second, gradient stability, checkpoint integrity, and data exposure.
- Use document-level splits to prevent dialogue leakage.

### 3. Assistant training
- Continue from a QQ-owned pretraining checkpoint only.
- Train assistant responses and complete multi-turn dialogues using the QQ tokenizer and format.
- Validate context retention, refusal/uncertainty behavior, answer structure, and instruction-following.

### 4. Evaluation and promotion
- Run fixed held-out Russian benchmarks for multi-turn context, reasoning, arithmetic, science, coding, uncertainty, factuality, and dialogue quality.
- Compare checkpoints with the same prompts, decoding parameters, and rubric.
- Review actual generated answers; loss alone is insufficient.
- Keep rejected candidates and their reports separate from the production candidate.
- Promote only a checkpoint that passes all required acceptance gates.

### 5. Online serving
- Host QQ-owned weights and the QQ inference runtime on the approved online compute.
- The browser sends requests to the QQ endpoint; it does not download model weights.
- Load and validate a checkpoint once per warm server process, with health checks, bounded inputs, timeouts, cancellation, and explicit unavailable/error states.
- Search is a separate evidence tool, never a generative fallback.

## Immediate next work

1. Stop all Gemma/QLoRA work. It is outside the agreed model architecture.
2. Audit the existing QQ training code, checkpoint metadata, and model server against this charter.
3. Recover and verify the actual persistent QQ-owned checkpoints and tokenizer hashes; do not infer their presence from an old sandbox.
4. Run the existing held-out benchmark against each available QQ checkpoint and preserve full outputs.
5. Complete the compute-feasibility gate for a medium QQ model trained from scratch.
6. Expand and validate the training corpus before increasing model size or steps.
7. Connect only the best verified QQ checkpoint to online inference; keep current low-quality prototypes clearly labelled as experimental.

## Promotion rule

No checkpoint is “medium”, “ready”, or “production” until the agreed seven capability directions have passed their tests and the fixed held-out benchmark shows useful, stable free-form answers. An HTTP 200, a lower loss, a successful build, or a generated string is not enough.
