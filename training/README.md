# QQ Quantum CPU training

QQ Quantum's Python training loop is an experimental, from-random-initialization
decoder-only Transformer. It does not load weights from another language model.

## Reproducible CPU environment

Use Python 3.13 and the CPU wheel index. The requirements file deliberately selects
the official PyTorch CPU index so a normal install does not pull CUDA or NVIDIA packages:

    python -m pip install -r requirements-qq-quantum-training.txt

Check the selected backend:

    python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.version.cuda)"

Expected on CPU: a +cpu version, False, and None.

## First smoke training

The checked-in seed corpus is compressed as qq_quantum/data/seed_corpus.txt.gz.b64.
The loader reads it directly; it also accepts ordinary UTF-8 .txt and .gz files.

    python scripts/train_qq_quantum.py --device cpu --steps 500       --batch-size 2 --block-size 64 --learning-rate 0.001       --vocab-size 512 --layers 1 --heads 2 --embedding-size 32       --dropout 0.05 --seed 20261121 --checkpoint-interval 25       --output-dir qq_quantum/artifacts/cpu-smoke

The --steps option means the target total optimizer step, not additional steps. To continue
the same run, keep the corpus and all training parameters unchanged and add --resume.
The command fails rather than silently starting over if its checkpoint is absent.

The script stores latest.pt and tokenizer.json in the output directory. Checkpoints
include the model, optimizer, corpus SHA-256, training parameters, validation loss,
and random-generator state. Generated checkpoints are local artifacts; do not commit
them or private datasets to the repository.

## Quality boundary

A successful smoke run proves that the tokenizer, model, optimizer, checkpoint,
resume path, and generation code can execute. It does not prove useful conversational
quality. The seed corpus is a small engineering corpus, not a sufficiently broad
language-model training dataset. Report losses and generations honestly, and do not
describe the model as production-ready until it passes a held-out Russian benchmark.
