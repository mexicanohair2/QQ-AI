#!/usr/bin/env python3
"""Build a small, fully authored Russian dialogue curriculum for QQ Quantum."""
from __future__ import annotations
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from qq_quantum.model.training import _read_corpus
from training.corpus_utils import deduplicate_standalone_qa_documents

SOURCE = ROOT / "qq_quantum/data/seed_corpus.txt.gz.b64"
OUT = ROOT / "training/data/qq_quantum_dialogue_v2.txt"

from training.dialogue_pairs import PAIRS
from training.dialogue_pairs_base_extra import BASE_EXTRA_PAIRS
from training.dialogue_pairs_extra import EXTRA_PAIRS
from training.dialogue_pairs_extra_two import EXTRA_PAIRS_SECOND
from training.dialogue_pairs_science import SCIENCE_PAIRS
from training.dialogues import DIALOGUES
from training.dialogues_extra import EXTRA_DIALOGUES

PAIRS.extend(BASE_EXTRA_PAIRS)
PAIRS.extend(EXTRA_PAIRS)
PAIRS.extend(EXTRA_PAIRS_SECOND)
PAIRS.extend(SCIENCE_PAIRS)
DIALOGUES.extend(EXTRA_DIALOGUES)

# Authored questions must be unique; duplicates encourage inconsistent answers.
_question_keys = [" ".join(question.casefold().split()) for question, _ in PAIRS]
if len(_question_keys) != len(set(_question_keys)):
    raise ValueError("Duplicate authored QQ Quantum questions detected")
for _dialogue in DIALOGUES:
    if len(_dialogue) < 2:
        raise ValueError("Each authored dialogue must contain at least one user/assistant pair")
    if any(
        not isinstance(turn, tuple) or len(turn) != 2
        or not all(isinstance(value, str) and value.strip() for value in turn)
        for turn in _dialogue
    ):
        raise ValueError("Each authored dialogue turn must be a non-empty question/answer pair")


base = _read_corpus(SOURCE).rstrip()
parts = [base, "\n\n# QQ Quantum dialogue curriculum v2\n"]
for q, a in PAIRS:
    parts.append("Ты QQ Quantum — экспериментальная языковая модель. Отвечай по-русски, учитывай контекст, объясняй ясно и не выдумывай факты.\n")
    parts.append(f"Пользователь: {q}\nQQ Quantum: {a}\n\n")
for index, turns in enumerate(DIALOGUES, 1):
    parts.append(f"Диалог {index}. Продолжай разговор, учитывая предыдущие сообщения.\n")
    for q, a in turns:
        parts.append(f"Пользователь: {q}\nQQ Quantum: {a}\n")
    parts.append("\n")
text = "".join(parts)
text, dedupe_stats = deduplicate_standalone_qa_documents(text)
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(text, encoding="utf-8")
print({"qa_pairs_added": len(PAIRS), "dialogues_added": len(DIALOGUES), "dialogue_turns_added": sum(map(len, DIALOGUES)), "characters": len(text), "words": len(text.split()), "dedupe": dedupe_stats, "output": str(OUT)})
