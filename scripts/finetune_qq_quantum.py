#!/usr/bin/env python3
"""Assistant-only supervised fine-tuning for a QQ Quantum checkpoint."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from qq_quantum.sft import train_sft


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", required=True, help="Same reviewed corpus used for pretraining")
    parser.add_argument("--pretrained-dir", required=True, help="QQ Quantum pretraining checkpoint directory")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--steps", type=int, default=1000, help="Target total SFT optimizer steps")
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--learning-rate", type=float, default=1e-4)
    parser.add_argument("--seed", type=int, default=20261122)
    parser.add_argument("--checkpoint-interval", type=int, default=50)
    parser.add_argument("--validation-fraction", type=float, default=0.1)
    parser.add_argument("--max-answer-tokens", type=int, default=64)
    parser.add_argument("--device", choices=("cpu", "cuda", "mps", "auto"), default="cpu")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    result = train_sft(
        corpus_path=args.corpus,
        pretrained_dir=args.pretrained_dir,
        output_dir=args.output_dir,
        max_steps=args.steps,
        batch_size=args.batch_size,
        learning_rate=args.learning_rate,
        seed=args.seed,
        device=args.device,
        checkpoint_interval=args.checkpoint_interval,
        validation_fraction=args.validation_fraction,
        max_answer_tokens=args.max_answer_tokens,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
