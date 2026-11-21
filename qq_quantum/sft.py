"""Assistant-only supervised fine-tuning for the project-owned QQ Quantum model."""
from __future__ import annotations

from collections.abc import Mapping
import hashlib
import random
from pathlib import Path
from typing import Any

import torch
from torch import Tensor
from torch.optim import AdamW

from .dialogue import build_conversation_prompt
from .model.tokenizer import ByteBPETokenizer
from .model.training import SPLIT_POLICY, _atomic_torch_save, _read_corpus, _split_corpus_documents
from .model.transformer import GPTConfig, QuantumGPT
from training.corpus_utils import load_corpus_manifest

SFT_CHECKPOINT_FORMAT = "qq-quantum-sft-v1"


def parse_dialogue_document(document: str) -> list[dict[str, str]]:
    """Parse complete alternating user/assistant turns from one corpus document."""
    turns: list[dict[str, str]] = []
    for raw_line in document.splitlines():
        line = raw_line.strip()
        if line.startswith("Пользователь:"):
            content = line[len("Пользователь:"):].strip()
            if not content or (turns and turns[-1]["role"] == "user"):
                return []
            turns.append({"role": "user", "content": content})
        elif line.startswith("QQ Quantum:"):
            content = line[len("QQ Quantum:"):].strip()
            if not content or not turns or turns[-1]["role"] != "user":
                return []
            turns.append({"role": "assistant", "content": content})

    if len(turns) < 2 or len(turns) % 2:
        return []
    if any(turn["role"] != ("user" if index % 2 == 0 else "assistant")
           for index, turn in enumerate(turns)):
        return []
    return turns


def _encode_answer_with_limit(
    answer: str,
    tokenizer: ByteBPETokenizer,
    capacity: int,
) -> list[int]:
    """Truncate on Unicode character boundaries, never midway through UTF-8."""
    if capacity < 1:
        return []
    full = tokenizer.encode(answer)
    if len(full) <= capacity:
        return full

    low, high = 0, len(answer)
    best: list[int] = []
    while low <= high:
        middle = (low + high) // 2
        candidate = tokenizer.encode(answer[:middle])
        if len(candidate) <= capacity:
            best = candidate
            low = middle + 1
        else:
            high = middle - 1
    return best


def build_sft_samples(
    corpus: str,
    tokenizer: ByteBPETokenizer,
    *,
    block_size: int,
    validation_fraction: float = 0.1,
    seed: int = 1337,
    max_answer_tokens: int = 64,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Build masked next-token samples; only assistant answer tokens contribute to loss."""
    if block_size < 32:
        raise ValueError("block_size must be at least 32 for the dialogue prompt")
    if max_answer_tokens < 1 or max_answer_tokens >= block_size:
        raise ValueError("max_answer_tokens must be positive and smaller than block_size")

    train_text, validation_text = _split_corpus_documents(corpus, validation_fraction, seed)

    def collect(partition: str, split_name: str) -> list[dict[str, Any]]:
        samples: list[dict[str, Any]] = []
        seen: set[tuple[str, str]] = set()
        documents = [part.strip() for part in partition.split("\n\n") if part.strip()]
        for document_index, document in enumerate(documents):
            turns = parse_dialogue_document(document)
            if not turns:
                continue
            document_digest = hashlib.sha256(document.encode("utf-8")).hexdigest()
            history: list[dict[str, str]] = []
            for index in range(0, len(turns), 2):
                user_turn, assistant_turn = turns[index], turns[index + 1]
                history.append({"role": "user", "content": user_turn["content"]})
                prompt_budget = max(16, block_size - max_answer_tokens)
                try:
                    prompt_text = build_conversation_prompt(
                        history,
                        tokenizer=tokenizer,
                        max_tokens=prompt_budget,
                    )
                except ValueError:
                    history.append({"role": "assistant", "content": assistant_turn["content"]})
                    continue

                prompt_ids = tokenizer.encode(prompt_text, add_bos=True)
                # Reserve one target position for EOS when possible.
                available = block_size + 1 - len(prompt_ids)
                answer_capacity = min(max_answer_tokens, max(0, available - 1))
                answer_ids = _encode_answer_with_limit(
                    assistant_turn["content"], tokenizer, answer_capacity
                )
                if not answer_ids:
                    history.append({"role": "assistant", "content": assistant_turn["content"]})
                    continue

                sequence = prompt_ids + answer_ids + [tokenizer.special_tokens["<EOS>"]]
                input_ids = sequence[:-1]
                labels = sequence[1:]
                mask_length = max(0, len(prompt_ids) - 1)
                labels[:mask_length] = [-100] * mask_length

                if not any(label != -100 for label in labels):
                    history.append({"role": "assistant", "content": assistant_turn["content"]})
                    continue
                if len(input_ids) > block_size or len(labels) > block_size:
                    raise RuntimeError("SFT sample exceeds model block_size after truncation")

                fingerprint = (prompt_text, assistant_turn["content"])
                if fingerprint not in seen:
                    seen.add(fingerprint)
                    samples.append({
                        "input_ids": input_ids,
                        "labels": labels,
                        "prompt_token_count": len(prompt_ids),
                        "prompt_text": prompt_text,
                        "target_text": assistant_turn["content"],
                        "document_id": document_digest,
                        "document_index": document_index,
                        "split": split_name,
                    })
                history.append({"role": "assistant", "content": assistant_turn["content"]})
        return samples

    train_samples = collect(train_text, "train")
    validation_samples = collect(validation_text, "validation")
    if not train_samples:
        raise ValueError("No valid assistant-answer samples in the training documents")
    if not validation_samples:
        raise ValueError("No valid assistant-answer samples in the validation documents")
    train_documents = {sample["document_id"] for sample in train_samples}
    validation_documents = {sample["document_id"] for sample in validation_samples}
    if train_documents & validation_documents:
        raise RuntimeError("Dialogue document leakage between SFT train and validation")
    return train_samples, validation_samples


def _collate(
    samples: list[dict[str, Any]],
    indices: list[int],
    pad_token_id: int,
    device: torch.device,
) -> tuple[Tensor, Tensor]:
    batch = [samples[index] for index in indices]
    width = max(len(sample["input_ids"]) for sample in batch)
    inputs = torch.full((len(batch), width), pad_token_id, dtype=torch.long)
    labels = torch.full((len(batch), width), -100, dtype=torch.long)
    for row, sample in enumerate(batch):
        input_ids = torch.tensor(sample["input_ids"], dtype=torch.long)
        targets = torch.tensor(sample["labels"], dtype=torch.long)
        inputs[row, :len(input_ids)] = input_ids
        labels[row, :len(targets)] = targets
    return inputs.to(device), labels.to(device)


def _evaluate(
    model: QuantumGPT,
    samples: list[dict[str, Any]],
    *,
    batch_size: int,
    pad_token_id: int,
    device: torch.device,
) -> float:
    model.eval()
    total_loss = 0.0
    total_tokens = 0
    with torch.inference_mode():
        for start in range(0, len(samples), batch_size):
            indices = list(range(start, min(start + batch_size, len(samples))))
            inputs, labels = _collate(samples, indices, pad_token_id, device)
            _, loss = model(inputs, labels)
            valid_tokens = int((labels != -100).sum().item())
            if loss is None or valid_tokens == 0:
                continue
            total_loss += float(loss.detach().cpu()) * valid_tokens
            total_tokens += valid_tokens
    if total_tokens == 0:
        raise RuntimeError("Validation contains no supervised answer tokens")
    return total_loss / total_tokens


def train_sft(
    *,
    corpus_path: str,
    pretrained_dir: str,
    output_dir: str,
    max_steps: int = 1000,
    batch_size: int = 4,
    learning_rate: float = 1e-4,
    seed: int = 1337,
    device: str = "auto",
    checkpoint_interval: int = 100,
    validation_fraction: float = 0.1,
    max_answer_tokens: int = 64,
) -> dict[str, Any]:
    """Fine-tune only assistant completions from an existing QQ Quantum checkpoint."""
    if max_steps < 1 or batch_size < 1 or checkpoint_interval < 1 or learning_rate <= 0:
        raise ValueError("Invalid SFT training limits")
    resolved = "cuda" if device == "auto" and torch.cuda.is_available() else (
        "cpu" if device == "auto" else device
    )
    if resolved not in {"cpu", "cuda", "mps"}:
        raise ValueError("Unsupported device")
    if resolved == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA unavailable")
    if resolved == "mps" and not (
        hasattr(torch.backends, "mps") and torch.backends.mps.is_available()
    ):
        raise RuntimeError("MPS unavailable")

    corpus = _read_corpus(corpus_path)
    corpus_sha = hashlib.sha256(corpus.encode("utf-8")).hexdigest()
    corpus_manifest = load_corpus_manifest(
        corpus_path, corpus_sha, expected_split_policy=SPLIT_POLICY
    )
    source_dir = Path(pretrained_dir)
    checkpoint_path = source_dir / "latest.pt"
    tokenizer_path = source_dir / "tokenizer.json"
    if not checkpoint_path.is_file() or not tokenizer_path.is_file():
        raise FileNotFoundError("Pretrained QQ Quantum checkpoint and tokenizer are required")

    pretrained = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    model_config = GPTConfig(**pretrained["model_config"])
    tokenizer = ByteBPETokenizer.load(tokenizer_path)
    if model_config.vocab_size != tokenizer.real_size:
        raise ValueError("Pretrained model and tokenizer vocabulary sizes do not match")

    train_samples, validation_samples = build_sft_samples(
        corpus,
        tokenizer,
        block_size=model_config.block_size,
        validation_fraction=validation_fraction,
        seed=seed,
        max_answer_tokens=max_answer_tokens,
    )
    model = QuantumGPT(model_config)
    model.load_state_dict(pretrained["model"])
    model.to(resolved)
    optimizer = AdamW(model.parameters(), lr=learning_rate)
    torch.manual_seed(seed)
    random.seed(seed)
    sampler = random.Random(seed)
    training_indices = list(range(len(train_samples)))
    resolved_device = torch.device(resolved)
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    tokenizer_out = output / "tokenizer.json"
    tokenizer.save(tokenizer_out)
    latest_path = output / "latest.pt"
    best_path = output / "best.pt"

    train_metadata = {
        "seed": seed,
        "batch_size": batch_size,
        "learning_rate": learning_rate,
        "block_size": model_config.block_size,
        "validation_fraction": validation_fraction,
        "split_policy": SPLIT_POLICY,
        "corpus_sha256": corpus_sha,
        "corpus_manifest_sha256": corpus_manifest["manifest_sha256"],
        "corpus_manifest_review_status": corpus_manifest["review_status"],
        "corpus_license_review_required": corpus_manifest["license_review_required"],
        "corpus_factual_review_required": corpus_manifest["factual_review_required"],
        "corpus_pii_review_required": corpus_manifest["pii_review_required"],
        "pretrained_checkpoint": str(checkpoint_path),
        "train_samples": len(train_samples),
        "validation_samples": len(validation_samples),
        "max_answer_tokens": max_answer_tokens,
    }
    best_validation = float("inf")
    last_loss = float("nan")
    last_validation = float("nan")

    def save(step: int, train_loss: float, validation_loss: float) -> None:
        nonlocal best_validation
        is_best = validation_loss < best_validation
        payload = {
            "format": SFT_CHECKPOINT_FORMAT,
            "step": step,
            "model_config": model.config_dict(),
            "model": model.state_dict(),
            "optimizer": optimizer.state_dict(),
            "loss": train_loss,
            "validation_loss": validation_loss,
            "training": train_metadata,
            "python_rng": random.getstate(),
            "torch_rng": torch.get_rng_state(),
        }
        _atomic_torch_save(payload, latest_path)
        if is_best:
            _atomic_torch_save(payload, best_path)
        best_validation = min(best_validation, validation_loss)

    for step in range(max_steps):
        model.train()
        sampler.shuffle(training_indices)
        batch_indices = training_indices[:batch_size]
        if len(batch_indices) < batch_size:
            batch_indices += sampler.choices(training_indices, k=batch_size - len(batch_indices))
        inputs, labels = _collate(
            train_samples, batch_indices, tokenizer.special_tokens["<PAD>"], resolved_device
        )
        _, loss = model(inputs, labels)
        if loss is None or not torch.isfinite(loss):
            raise RuntimeError("SFT produced a non-finite training loss")
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        last_loss = float(loss.detach().cpu())

        completed = step + 1
        if completed % checkpoint_interval == 0 or completed == max_steps:
            last_validation = _evaluate(
                model,
                validation_samples,
                batch_size=batch_size,
                pad_token_id=tokenizer.special_tokens["<PAD>"],
                device=resolved_device,
            )
            save(completed, last_loss, last_validation)

    return {
        "trained": True,
        "start_step": 0,
        "final_step": max_steps,
        "steps_run": max_steps,
        "last_loss": last_loss,
        "validation_loss": last_validation,
        "best_validation_loss": best_validation,
        "train_samples": len(train_samples),
        "validation_samples": len(validation_samples),
        "device": resolved,
        "checkpoint": str(latest_path),
        "best_checkpoint": str(best_path),
        "tokenizer": str(tokenizer_out),
        "corpus_manifest": corpus_manifest,
    }
