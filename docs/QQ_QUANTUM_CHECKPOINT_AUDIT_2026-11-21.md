# QQ Quantum — checkpoint and quality audit (2026-11-21)

## Scope

This audit covers only QQ-owned checkpoints trained from random initialization and the project-owned tokenizer/Transformer. No third-party pretrained weights were loaded. The held-out generation benchmark is `evals/qq-quantum-dialogue-holdout.ru.json` with SHA-256:

`d33d139c05ee57914ea269975f8f71c50fbeb834b6626a28b3c0a18ce15cd3fe`

## Actual runtime inspected

- Python 3.13
- PyTorch 2.14.0+cpu
- 1 logical CPU
- 2 GiB RAM
- CUDA unavailable

This environment can run small CPU tests and inspect checkpoints. It is not a medium-model training host.

## Checkpoints inspected

Parameter counts below use unique trainable parameters from `model.parameters()`. The model ties `lm_head.weight` to `token_embedding.weight`; summing every state-dict tensor counts that shared embedding twice and overstates the parameter count.

| Checkpoint | Unique parameters | Architecture | Training result | Decision |
|---|---:|---|---|---|
| `cpu-smoke-20261121` | 31,200 | 1 layer, 2 heads, width 32, context 64, vocab 512 | 500 steps; train loss 4.1474; validation loss 4.3778 | Engineering smoke only; generated Russian was incoherent |
| `model-online-v1` | 478,720 | 2 layers, 4 heads, width 128, context 128, vocab 512 | 500 steps; train loss 3.1255; validation loss 3.5017 | HTTP/auth/retrieval path tested; not useful as a free-form assistant |
| `model-dialogue-v4-sft-best` | 544,256 | 2 layers, 4 heads, width 128, context 128, vocab 1024 | SFT checkpoint step 325; validation loss 4.1246 | Failed free-generation benchmark |
| `model-dialogue-v6-sft-best` | 544,256 | Same 2/4/128/128/1024 configuration | Best validation loss 1.7070 at step 25 | Failed free-generation benchmark despite lower loss |
| `model-dialogue-v7-sft` | 544,256 | Same 2/4/128/128/1024 configuration | 100 steps; train loss 2.9768; validation loss 2.4138 | Rejected; outputs remained malformed/repetitive |

Selected artifact hashes:

- `cpu-smoke-20261121/latest.pt`: `0b1762f8c2d2f57dfe3912b6ad402122807a868f2198eaa97150d3f35f1fa9ad`
- `model-online-v1/latest.pt`: `83bd6bc9d1bd3340a79da7fee922411af12603254f2d36315f9fdcc30c3d06d6`
- `model-dialogue-v4-sft-best/latest.pt`: `7d721d60d2cf34de773fe5afb50e161f9f2f601c9df8792ec29fef1838b79aa0`
- `model-dialogue-v6-sft-best/latest.pt`: `7ca5091b022d8eda954af4a6a7169e6dd6fac544676ad00691801492b54587fd`
- `model-dialogue-v7-sft/latest.pt`: `2e2363983caa677fbbb30de145c585a489016e1c155025fba7dd3f3b74d44b30`

## Fresh held-out generation rerun

Three checkpoints were reloaded and evaluated again with identical settings:

- benchmark: 10 cases;
- seed: 20261122;
- maximum generated tokens: 64;
- temperature: 0.25;
- top-k: 12.

All 30 answers were generated, but the outputs did not satisfy the benchmark rubrics. Common failures included malformed Russian, repetition, loss of the question, incorrect factual content, and failure to solve arithmetic or explain concepts. No checkpoint is promoted.

This confirms an important distinction: a lower validation loss on a small authored dataset did not yield useful free-form conversation. Do not keep extending the same small corpus and call the resulting checkpoint an improved assistant.

## Data and training bottleneck

The inspected v4 pretraining checkpoint was trained on a corpus snapshot of 107,362 characters, 331 documents, 21,703 training tokens and 2,473 validation tokens. That is far too little text to establish broad language competence for a model with hundreds of thousands of parameters, let alone a medium model.

Next data work must focus on a materially larger, licensed, deduplicated Russian-first corpus with balanced coverage. Keep held-out prompts isolated from corpus creation and tokenizer fitting. Do not use private conversations or user files as training data.

## Compute feasibility — public information, not account verification

- Kaggle's official notebook documentation describes free GPU notebook accelerators, including a P100, with queue/availability caveats and a maximum 12-hour session in its technical specifications: https://www.kaggle.com/docs/notebooks
- Kaggle's GPU tips page describes a weekly GPU quota of up to 30 hours: https://www.kaggle.com/page/GPU-tips-and-tricks
- Kaggle's terms say users who are not of legal age to form a binding contract should consult its children's privacy terms and contact support about parental consent: https://www.kaggle.com/terms
- Google Colab says free resources are not guaranteed, limits vary, and free sessions can run for up to 12 hours depending on availability and usage: https://research.google.com/colaboratory/faq.html
- Hugging Face ZeroGPU currently lists a 5-minute daily quota for free personal accounts, which is not a realistic pretraining allocation: https://huggingface.co/docs/hub/spaces-zerogpu

No account-level GPU allocation has been verified. No account has been created or changed, no paid compute has been enabled, and no age or consent rule may be bypassed. Treat Kaggle/Colab only as candidates pending permitted access and a real hardware probe.

## Required next steps

1. Finish the compute-feasibility gate with actual available hardware, session limits, persistent storage and throughput measurements.
2. Define a realistic medium-model parameter range and context length from those measurements; do not select a size by marketing label.
3. Expand the reviewed/licensed corpus substantially before another long training run.
4. Add token-count, document-count, deduplication, contamination and license manifests to each corpus build.
5. Train only from random initialization, preserving reproducible checkpoints and exact resume.
6. Evaluate each candidate on the same held-out benchmark and manually review answers before promotion.
7. Keep online inference on QQ-owned checkpoints only. The active product phase is online; browser/offline model downloads remain deferred.

## Final status

**QQ Quantum has a real from-scratch prototype and reproducible training code, but it does not yet have a medium-capability conversational model.** The current blocker is not the lack of a pretrained model; it is the scale and quality of data, the amount of training, and the absence of a confirmed sustained compute allocation.
