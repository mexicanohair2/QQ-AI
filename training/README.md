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

## Russian dialogue curriculum (v2)

The small authored curriculum is assembled from the checked-in seed corpus plus
original Russian question/answer examples and complete multi-turn dialogues:

    python training/build_dialogue_corpus.py

This writes training/data/qq_quantum_dialogue_v2.txt. The authored examples are a starter curriculum, not a comprehensive or independently
fact-checked encyclopedia. The builder writes a source-fingerprinted sidecar manifest.
The seed-corpus origin is not recorded and the curriculum content license is unassigned;
both, along with facts and privacy, require review before a checkpoint is promoted or
publicly distributed.

Train a new checkpoint from scratch (do not resume an older checkpoint when changing
the corpus, tokenizer size, or split policy):

    OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 python scripts/train_qq_quantum.py --corpus training/data/qq_quantum_dialogue_v2.txt --output-dir qq_quantum/artifacts/model-dialogue-v3 --steps 5000 --batch-size 8 --block-size 128 --learning-rate 0.0003 --vocab-size 1024 --layers 2 --heads 4 --embedding-size 128 --dropout 0.1 --seed 20261122 --checkpoint-interval 250 --device cpu

The current split policy is seeded-normalized-document-group-split-v3. It assigns
whole blank-line-delimited documents to train or validation using a deterministic seed.
Before splitting, documents with identical NFC-normalized text (whitespace collapsed
and case-folded) are grouped so normalized exact duplicates cannot cross partitions.
A complete conversation never crosses the split. The BPE tokenizer is trained only
on the training partition, so merges are not learned directly from held-out text.

For exact resume, keep the same corpus bytes, split policy, seed, tokenizer/model
sizes, optimizer settings, and output directory, then add --resume and increase
--steps to the new target total. A corpus or configuration mismatch is rejected.

## Authored Russian dialogue curriculum and two-stage training

training/build_dialogue_corpus.py reads the tracked compressed seed corpus
qq_quantum/data/seed_corpus.txt.gz.b64 and the authored curriculum split across
training/dialogue_pairs.py (standalone Q&A) and training/dialogues.py (multi-turn
conversation examples). It creates the generated corpus at
training/data/qq_quantum_dialogue_v2.txt. The builder validates authored question
uniqueness, complete multi-turn role alternation, and removes duplicate
standalone Q&A documents after combining the original seed corpus with the new
curriculum. When duplicate standalone prompts conflict, the most recently curated
answer is retained. Multi-turn dialogue documents are never collapsed or removed:
their answers depend on the preceding turns.

Current generated corpus snapshot:
- 213 authored standalone Q&A examples and 30 authored multi-turn dialogues (120 turns).
- 13,880 words and 104,431 characters across 314 documents.
- 273 standalone Q&A documents were encountered before deduplication; 24 duplicates
  were removed, leaving 249 unique standalone QA documents.
- The runtime retrieval parser exposes 252 unique standalone question/answer entries
  because a few source documents contain more than one standalone pair.
- The SFT builder creates 336 training samples and 38 validation samples; 82 of the
  training samples include previous dialogue turns.
- 252/252 exact standalone questions match their canonical answer. An additional
  260/260 authored definition paraphrase probes return the same answer.

The exact counts are reproducible from tracked source files by running
python training/build_dialogue_corpus.py. This also writes
training/data/qq_quantum_dialogue_v2.manifest.json with source-file hashes, corpus
hash, split policy, duplicate counts, and explicit pending review flags. Training
validates the manifest and records its hash and review status in each checkpoint.
The runtime retrieval index deliberately excludes
documents beginning with "Диалог "; multi-turn dialogue remains in the SFT data,
where the full history is included in the prompt.

### Stage 1 — pretraining from random initialization

The current experimental baseline uses the project's own byte-level BPE tokenizer
and decoder-only Transformer. It is initialized from random weights, not from another
language model:

    OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 python scripts/train_qq_quantum.py --corpus training/data/qq_quantum_dialogue_v2.txt --output-dir qq_quantum/artifacts/model-dialogue-v4-pretrain --steps 2500 --batch-size 8 --block-size 128 --learning-rate 0.0003 --vocab-size 1024 --layers 2 --heads 4 --embedding-size 128 --dropout 0.1 --seed 20261122 --checkpoint-interval 250 --device cpu

The split policy is seeded-normalized-document-group-split-v3. Whole documents are
assigned to train or validation before tokenization, and normalized exact duplicates
are kept in the same partition. The BPE tokenizer is trained only on the training
partition. Do not reuse or resume a checkpoint created with a different corpus or
split policy.

### Stage 2 — assistant-only supervised fine-tuning

The SFT stage starts from the QQ Quantum checkpoint created in stage 1. It uses the
same corpus bytes, split seed, and complete-document split. Prompt tokens are masked
with the cross-entropy ignore value, so only assistant answer tokens contribute to
the fine-tuning loss. Multi-turn samples include the previous user/assistant turns
that fit within the model context window. Both latest.pt and the best validation
checkpoint are saved atomically:

    OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 python scripts/finetune_qq_quantum.py --corpus training/data/qq_quantum_dialogue_v2.txt --pretrained-dir qq_quantum/artifacts/model-dialogue-v4-pretrain --output-dir qq_quantum/artifacts/model-dialogue-v4-sft --steps 1000 --batch-size 4 --learning-rate 0.0001 --seed 20261122 --checkpoint-interval 50 --validation-fraction 0.1 --max-answer-tokens 64 --device cpu

The output remains the same QQ Quantum Transformer architecture and tokenizer.
The online server can load it using QQ_QUANTUM_MODEL_DIR and use the same corpus
for retrieval through QQ_QUANTUM_CORPUS_PATH. Do not publish or serve a checkpoint
until held-out generation and dialogue tests show that it is more useful without
increasing unsupported answers.

### Runtime API acceptance test

With the private API running, set QQ_QUANTUM_TOKEN in the shell environment and
run:

    python scripts/smoke_test_qq_quantum_api.py

The script checks the health contract, eight answer scenarios (including a
multi-turn follow-up, paraphrased questions, arithmetic, and a deliberately
unknown question), SSE completion, authentication rejection, and malformed
request rejection. It does not store or print the bearer token. You can override
the default localhost endpoint with QQ_QUANTUM_API_BASE_URL.

### Held-out conversation benchmark

A separate set of ten questions and short dialogue continuations lives in
evals/qq-quantum-dialogue-holdout.ru.json. The prompts are intended for
evaluation only and are not added to the training corpus. To record generated
answers for manual rubric review:

    OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 python scripts/evaluate_qq_quantum.py --model-dir qq_quantum/artifacts/model-dialogue-v4-pretrain --benchmark evals/qq-quantum-dialogue-holdout.ru.json --output qq_quantum/artifacts/evaluations/dialogue-v4-pretrain.json --seed 20261122

Repeat for the SFT checkpoint by changing --model-dir to the SFT output directory
and using a different output filename. The JSON report records model and benchmark
checksums, checkpoint step, prompt, generated answer, and review rubric. It does not
assign an automatic quality score; each answer must be reviewed against the rubric.


## Clean-corpus experiment status (21 November 2026)

The earlier model-dialogue-v4-pretrain checkpoint was stopped at 2,000 steps
after the validation loss plateaued. The earlier v4 SFT experiments reached a best
validation loss of about 4.124 on the then-current, duplicate-containing split.
Those figures are not directly comparable to the clean-corpus validation set
because the document set and held-out documents changed.

A clean-corpus SFT candidate was trained for 100 steps from the previous best v4
SFT checkpoint using learning rate 1e-5. Its best checkpoint was step 10 with
validation loss 1.98696. The previous v4 checkpoint, evaluated on the exact same
clean-corpus validation samples, scored 1.98727. This tiny difference is not
evidence of a meaningful improvement. The candidate also did not improve the
10-case free-generation benchmark: most unseen answers remain incoherent.

For now, the existing v4 SFT checkpoint remains the selected experimental model.
The cleaned corpus and retrieval index improve factual lookup, but they do not make
the model's unrestricted generation production-ready. The API retains its
fail-closed quality gate. No public deployment, QQCross integration, or production
promotion has been performed.
