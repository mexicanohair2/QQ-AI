# QQ Quantum — CPU smoke report (2026-11-21)

## Result

A real CPU training run was completed from random initialization. The checkpoint was reloaded into the QQ Quantum Transformer and text generation was executed. This is an engineering smoke-test only; the output is not yet useful conversational language.

## Environment

- Python 3.13
- PyTorch 2.14.0+cpu
- NumPy 2.5.5
- 1 vCPU / 2 GiB RAM
- CUDA unavailable; no CUDA or NVIDIA libraries installed

## Dataset

- Source: qq_quantum/data/seed_corpus.txt.gz.b64
- Decoded UTF-8 characters: 25,626
- Lines: 300
- BPE tokens: 11,223
- SHA-256: 7ebdfde595b94ebac8f891131cfa8c3834ff683679e09f3510ea7d1944073efc

## Model and training

- Architecture: project-owned decoder-only Transformer
- Tokenizer: project-owned byte-level BPE
- Initialization: random; no pretrained weights
- Vocabulary: 512
- Context/block size: 64
- Transformer layers: 1
- Attention heads: 2
- Embedding width: 32
- Parameters: 31,200
- Batch size: 2
- Learning rate: 0.001
- Dropout: 0.05
- Seed: 20261121
- Optimizer updates: 500 total
- Resume: first 60 steps, then resumed from step 60 through step 499

## Metrics

| Metric | Value |
|---|---:|
| Initial validation loss | 6.2459393 |
| Final train loss | 4.1474056 |
| Final validation loss | 4.3777957 |
| Checkpoint size | 407,662 bytes |
| Checkpoint SHA-256 | 0b1762f8c2d2f57dfe3912b6ad402122807a868f2198eaa97150d3f35f1fa9ad |

The validation loss decreased by approximately 1.8681 from the initial baseline under the same configuration and seed. This does not establish general language ability; the corpus is very small and the model has only 31,200 parameters.

## Generation check

Prompt: QQ Quantum —

The reloaded checkpoint generated:

> QQ Quantum — ааму инет сои подолы ввии су и вро и ви ви. Пы дои подя воле ррредемя свам. Половншно с

This is visibly incoherent. Generation works technically, but language quality is insufficient for chat or reasoning tasks.

## Existing experimental HTTP model server

A separate pre-existing local artifact used by qq_quantum/serve_online.py was also inspected and loaded:
- 500 optimizer steps; 478,720 parameters; 2 Transformer layers, 4 heads, embedding width 128, block size 128;
- train loss 3.1254632; validation loss 3.5017388;
- checkpoint model-online-v1/latest.pt, 5,791,627 bytes, SHA-256 83bd6bc9d1bd3340a79da7fee922411af12603254f2d36315f9fdcc30c3d06d6;
- same seed corpus hash as above and vocabulary 512.

This is a separate checkpoint from the 31,200-parameter smoke run in this report. The running experimental server returned HTTP 200 for an exact corpus Q&A match and valid SSE termination; an unauthorised request returned 401. For a question outside the 65-entry Q&A retrieval set, the service refused to return its low-quality free-generation output. Thus the HTTP/auth/retrieval path works, while general free-form answer quality remains inadequate. The server is running only inside the temporary Vercel Sandbox and is not wired to the public QQ-AI Preview deployment.

## Validation performed

- 7 QQ Quantum core tests passed: Unicode/BPE round-trip, token persistence, special-token behavior, plain/gzip/base64-gzip corpus loading, Transformer output and causal mask, invalid configuration rejection, CPU training/checkpoint/resume/generation. The resume test also compares exact model tensors against uninterrupted training.
- 4 existing training-data validator tests passed.
- Training-data validator self-test passed.
- Python compileall passed.
- CPU-only dependency requirements dry-run selected torch 2.14.0+cpu; no CUDA packages were requested.

## Artifact retention

The full training checkpoint latest.pt remains in the persistent Vercel Sandbox and is not committed to Git or deployed to the website. The matching tokenizer.json is versioned in the QQ-AI repository under qq_quantum/artifacts/model-online-v1/. The checkpoint is not a product release and the training result must not be represented as a completed conversational model.
