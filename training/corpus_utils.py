"""Utilities for keeping standalone QA targets deterministic in training corpora."""
from __future__ import annotations

import re

_WORD_RE = re.compile(r"[а-яёa-z0-9]+", re.I)


def normalize_prompt_key(question: str) -> str:
    """Normalize case and punctuation without changing word order."""
    return " ".join(_WORD_RE.findall(question.casefold()))


def _standalone_qa_key(document: str) -> str | None:
    """Return a key only for a document containing exactly one context-free QA pair."""
    if document.startswith("Диалог "):
        return None

    question: str | None = None
    pair_count = 0
    key: str | None = None
    for raw_line in document.splitlines():
        line = raw_line.strip()
        if line.startswith("Пользователь:"):
            if question is not None:
                return None
            question = line[len("Пользователь:"):].strip()
        elif line.startswith("QQ Quantum:") and question:
            pair_count += 1
            if pair_count > 1:
                return None
            key = normalize_prompt_key(question)
            question = None

    return key if pair_count == 1 and key else None


def deduplicate_standalone_qa_documents(corpus: str) -> tuple[str, dict[str, int]]:
    """Keep the last curated standalone answer for each prompt.

    Multi-turn dialogue documents are intentionally preserved in full because
    their answer may depend on earlier user/assistant messages. Non-QA source
    documents and comments are also preserved.
    """
    documents = [
        block.strip()
        for block in re.split(r"\n\s*\n", corpus)
        if block.strip()
    ]
    output: list[str | None] = []
    last_position: dict[str, int] = {}
    standalone_count = 0
    duplicates_removed = 0

    for document in documents:
        key = _standalone_qa_key(document)
        if key is None:
            output.append(document)
            continue

        standalone_count += 1
        previous = last_position.get(key)
        if previous is not None:
            output[previous] = None
            duplicates_removed += 1
        last_position[key] = len(output)
        output.append(document)

    cleaned = "\n\n".join(block for block in output if block is not None) + "\n"
    stats = {
        "standalone_documents_before": standalone_count,
        "standalone_documents_after": len(last_position),
        "duplicate_standalone_documents_removed": duplicates_removed,
        "unique_standalone_prompts": len(last_position),
    }
    return cleaned, stats
