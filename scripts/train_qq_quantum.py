#!/usr/bin/env python3
"""Reproducible CPU-first training entry point for QQ Quantum."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from qq_quantum.model.training import train


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", default="qq_quantum/data/seed_corpus.txt.gz.b64")
    parser.add_argument("--output-dir", default="qq_quantum/artifacts/cpu-run")
    parser.add_argument("--steps", type=int, default=100, help="Target total optimizer step")
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--block-size", type=int, default=64)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--vocab-size", type=int, default=512)
    parser.add_argument("--layers", type=int, default=2)
    parser.add_argument("--heads", type=int, default=2)
    parser.add_argument("--embedding-size", type=int, default=64)
    parser.add_argument("--dropout", type=float, default=0.1)
    parser.add_argument("--seed", type=int, default=1337)
    parser.add_argument("--checkpoint-interval", type=int, default=10)
    parser.add_argument("--device", choices=("cpu", "auto"), default="cpu")
    parser.add_argument("--resume", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    result = train(
        corpus_path=args.corpus,
        output_dir=args.output_dir,
        max_steps=args.steps,
        batch_size=args.batch_size,
        block_size=args.block_size,
        learning_rate=args.learning_rate,
        vocab_size=args.vocab_size,
        n_layer=args.layers,
        n_head=args.heads,
        n_embd=args.embedding_size,
        dropout=args.dropout,
        seed=args.seed,
        device=args.device,
        resume=args.resume,
        checkpoint_interval=args.checkpoint_interval,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result.get("checkpoint") else 1


if __name__ == "__main__":
    raise SystemExit(main())
