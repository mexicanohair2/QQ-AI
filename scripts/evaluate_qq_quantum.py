#!/usr/bin/env python3
"""Generate deterministic answers for the held-out QQ Quantum dialogue benchmark."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

import torch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from qq_quantum.dialogue import build_conversation_prompt
from qq_quantum.model.tokenizer import ByteBPETokenizer
from qq_quantum.model.transformer import GPTConfig, QuantumGPT
from qq_quantum.model.training import completed_training_step


def load_checkpoint(model_dir: Path):
    checkpoint_path = model_dir / "latest.pt"
    tokenizer_path = model_dir / "tokenizer.json"
    if not checkpoint_path.is_file() or not tokenizer_path.is_file():
        raise FileNotFoundError("A QQ Quantum checkpoint and tokenizer are required")
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    tokenizer = ByteBPETokenizer.load(tokenizer_path)
    config = GPTConfig(**checkpoint["model_config"])
    if config.vocab_size != tokenizer.real_size:
        raise ValueError("Model/tokenizer vocabulary mismatch")
    model = QuantumGPT(config)
    model.load_state_dict(checkpoint["model"])
    model.eval()
    return model, tokenizer, checkpoint


def generate_answer(model, tokenizer, messages, *, seed: int, max_new_tokens: int, temperature: float, top_k: int):
    prompt = build_conversation_prompt(
        messages,
        tokenizer=tokenizer,
        max_tokens=model.config.block_size,
    )
    input_ids = tokenizer.encode(prompt, add_bos=True)
    if len(input_ids) > model.config.block_size:
        raise ValueError("Prompt exceeds model context window")
    tokens = torch.tensor([input_ids], dtype=torch.long)
    torch.manual_seed(seed)
    with torch.inference_mode():
        output = model.generate(
            tokens,
            max_new_tokens=max_new_tokens,
            temperature=temperature,
            top_k=top_k,
            eos_token_id=tokenizer.special_tokens["<EOS>"],
        )
    answer = tokenizer.decode(
        output[0].tolist()[len(input_ids):],
        skip_special_tokens=True,
    ).strip()
    return prompt, answer


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--benchmark", default="evals/qq-quantum-dialogue-holdout.ru.json")
    parser.add_argument("--output", required=True)
    parser.add_argument("--seed", type=int, default=20261122)
    parser.add_argument("--max-new-tokens", type=int, default=64)
    parser.add_argument("--temperature", type=float, default=0.25)
    parser.add_argument("--top-k", type=int, default=12)
    args = parser.parse_args()

    model_dir = Path(args.model_dir)
    benchmark_path = Path(args.benchmark)
    benchmark = json.loads(benchmark_path.read_text(encoding="utf-8"))
    if benchmark.get("schemaVersion") != 1 or not isinstance(benchmark.get("cases"), list):
        raise ValueError("Unsupported holdout benchmark format")
    model, tokenizer, checkpoint = load_checkpoint(model_dir)

    results = []
    for index, case in enumerate(benchmark["cases"]):
        messages = case.get("messages")
        if not isinstance(messages, list) or not messages:
            raise ValueError(f"Invalid messages in benchmark case {case.get('id')}")
        prompt, answer = generate_answer(
            model,
            tokenizer,
            messages,
            seed=args.seed + index,
            max_new_tokens=args.max_new_tokens,
            temperature=args.temperature,
            top_k=args.top_k,
        )
        results.append({
            "id": case["id"],
            "category": case.get("category"),
            "prompt": prompt,
            "answer": answer,
            "rubric": case.get("rubric", []),
        })

    benchmark_sha = hashlib.sha256(benchmark_path.read_bytes()).hexdigest()
    checkpoint_sha = hashlib.sha256((model_dir / "latest.pt").read_bytes()).hexdigest()
    report: dict[str, Any] = {
        "benchmark": str(benchmark_path),
        "benchmark_sha256": benchmark_sha,
        "model_dir": str(model_dir),
        "checkpoint_sha256": checkpoint_sha,
        "checkpoint_step": completed_training_step(checkpoint),
        "checkpoint_format": checkpoint.get("format"),
        "model_config": checkpoint["model_config"],
        "seed": args.seed,
        "temperature": args.temperature,
        "top_k": args.top_k,
        "results": results,
    }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({
        "cases": len(results),
        "checkpoint_step": report["checkpoint_step"],
        "output": str(output_path),
        "benchmark_sha256": benchmark_sha,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
