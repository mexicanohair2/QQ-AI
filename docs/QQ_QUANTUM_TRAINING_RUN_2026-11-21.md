# QQ Quantum training run â€” 2026-11-21

## Run configuration

- Candidate: `model-dialogue-v6-sft`
- Initialization: `model-dialogue-v5-sft-clean/latest.pt`
- Method: assistant-only supervised fine-tuning
- Device: CPU, one thread
- Steps: 250
- Batch size: 4
- Learning rate: 0.00001
- Seed: 20261123
- Max answer tokens: 64
- Dataset split: 342 training samples, 32 validation samples

## Results

| Metric | Result |
|---|---:|
| Final training loss | 2.0600 |
| Final validation loss | 1.7289 |
| Best validation loss | 1.7070 |
| Best checkpoint step | 25 |
| Held-out dialogue cases | 10 |

The deterministic held-out generation benchmark remained poor: multi-turn context, science, arithmetic and programming prompts produced malformed or repetitive text. Lower validation loss did not translate into acceptable free-form generation. The best checkpoint is preserved for research only and is not used by the live online package.

## Decision

Do not promote v6. The next training stage needs a materially larger reviewed corpus and a model capacity/context-window increase. More steps on the same 374-sample corpus are likely to overfit; the validation curve already worsened after step 25. Do not use private chat history as training material.

## Artifacts

- `training-artifacts/qq-quantum-v6-sft-best.pt.part-00` through `part-02` (reassemble with `node scripts/restore_qq_quantum_checkpoint.mjs`; SHA-256 is verified)
- `qq_quantum/artifacts/model-dialogue-v6-sft-best/tokenizer.json`
-¶»§q«^