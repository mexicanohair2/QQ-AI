# QQ Quantum training run — 2026-11-21

## Configuration
- Candidate: v6 supervised fine-tuning
- Initialization: v5 SFT checkpoint
- Device: CPU
- Steps: 250
- Batch size: 4
- Learning rate: 0.00001
- Seed: 20261123
- Dataset split: 342 training examples, 32 validation examples
- Held-out generation benchmark: 10 dialogue cases

## Results
| Metric | Result |
|---|---:|
| Final training loss | 2.0600 |
| Final validation loss | 1.7289 |
| Best validation loss | 1.7070 |
| Best checkpoint step | 25 |

The held-out free-generation benchmark still produced malformed or repetitive answers on multi-turn context, science, arithmetic and programming prompts. Lower validation loss did not translate into acceptable free-form answer quality. The candidate was not promoted.

## Decision
Do not continue adding steps to this small dataset: validation worsened after step 25, indicating overfitting. The next stage requires a materially larger reviewed/licensed corpus, better coverage and a larger model/context window. Private user chats must not be used as training data.

The experiment ran in a temporary research sandbox. The metrics and decision are recorded here; the candidate weights are not part of the deployed model package.
