#!/usr/bin/env python3
"""Build the QQ Quantum dialogue corpus and a source-fingerprinted manifest."""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from qq_quantum.model.training import SPLIT_POLICY, _read_corpus
from training.corpus_utils import deduplicate_standalone_qa_documents

SOURCE = ROOT / "qq_quantum/data/seed_corpus.txt.gz.b64"
OUT = ROOT / "training/data/qq_quantum_dialogue_v2.txt"
MANIFEST = OUT.with_suffix(".manifest.json")

from training.dialogue_pairs import PAIRS as BASE_PAIRS
from training.dialogue_pairs_base_extra import BASE_EXTRA_PAIRS
from training.dialogue_pairs_extra import EXTRA_PAIRS
from training.dialogue_pairs_extra_two import EXTRA_PAIRS_SECOND
from training.dialogue_pairs_science import SCIENCE_PAIRS
from training.dialogues import DIALOGUES as BASE_DIALOGUES
from training.dialogues_extra import EXTRA_DIALOGUES

# Build fresh combined lists; never mutate imported module-level curriculum data.
AUTHORED_PAIRS = [
    *BASE_PAIRS,
    *BASE_EXTRA_PAIRS,
    *EXTRA_PAIRS,
    *EXTRA_PAIRS_SECOND,
    *SCIENCE_PAIRS,
]
AUTHORED_DIALOGUES = [*BASE_DIALOGUES, *EXTRA_DIALOGUES]

_question_keys = [" ".join(question.casefold().split()) for question, _ in AUTHORED_PAIRS]
if len(_question_keys) != len(set(_question_keys)):
    raise ValueError("Duplicate authored QQ Quantum questions detected")
for dialogue in AUTHORED_DIALOGUES:
    if len(dialogue) < 2:
        raise ValueError("Each authored dialogue must contain at least one user/assistant pair")
    if any(
        not isinstance(turn, tuple) or len(turn) != 2
        or not all(isinstance(value, str) and value.strip() for value in turn)
        for turn in dialogue
    ):
        raise ValueError("Each authored dialogue turn must be a non-empty question/answer pair")


base = _read_corpus(SOURCE).rstrip()
parts = [base, "\n\n# QQ Quantum dialogue curriculum v2\n"]
for question, answer in AUTHORED_PAIRS:
    parts.append(
        "Ты QQ Quantum — экспериментальная языковая модель. "
        "Отвечай по-русски, учитывай контекст, объясняй ясно и не выдумывай факты.\n"
    )
    parts.append(f"Пользователь: {question}\nQQ Quantum: {answer}\n\n")
for index, dialogue in enumerate(AUTHORED_DIALOGUES, 1):
    parts.append(f"Диалог {index}. Продолжай разговор, учитывая предыдущие сообщения.\n")
    for question, answer in dialogue:
        parts.append(f"Пользователь: {question}\nQQ Quantum: {answer}\n")
    parts.append("\n")

corpus_text = "".join(parts)
corpus_text, dedupe_stats = deduplicate_standalone_qa_documents(corpus_text)
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(corpus_text, encoding="utf-8")
corpus_sha256 = hashlib.sha256(corpus_text.encode("utf-8")).hexdigest()

source_specs = [
    (SOURCE, "seed_corpus", "origin_not_recorded_in_repository", "unverified"),
    (ROOT / "training/dialogue_pairs.py", "authored_qa", "project_authored_origin_to_be_reviewed", "unassigned"),
    (ROOT / "training/dialogue_pairs_base_extra.py", "authored_qa", "project_authored_origin_to_be_reviewed", "unassigned"),
    (ROOT / "training/dialogue_pairs_extra.py", "authored_qa", "project_authored_origin_to_be_reviewed", "unassigned"),
    (ROOT / "training/dialogue_pairs_extra_two.py", "authored_qa", "project_authored_origin_to_be_reviewed", "unassigned"),
    (ROOT / "training/dialogue_pairs_science.py", "authored_qa", "project_authored_origin_to_be_reviewed", "unassigned"),
    (ROOT / "training/dialogues.py", "authored_dialogue", "project_authored_origin_to_be_reviewed", "unassigned"),
    (ROOT / "training/dialogues_extra.py", "authored_dialogue", "project_authored_origin_to_be_reviewed", "unassigned"),
    (ROOT / "training/build_dialogue_corpus.py", "builder_code", "project_code", "unassigned"),
    (ROOT / "training/corpus_utils.py", "builder_code", "project_code", "unassigned"),
    (ROOT / "qq_quantum/model/training.py", "training_policy_code", "project_code", "unassigned"),
]
source_entries = []
for path, kind, provenance, license_status in source_specs:
    raw = path.read_bytes()
    source_entries.append({
        "path": path.relative_to(ROOT).as_posix(),
        "kind": kind,
        "provenance": provenance,
        "license_status": license_status,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    })

documents = [part for part in corpus_text.split("\n\n") if part.strip()]
manifest = {
    "schema_version": 1,
    "manifest_type": "qq-quantum-training-corpus",
    "corpus": {
        "path": OUT.relative_to(ROOT).as_posix(),
        "sha256": corpus_sha256,
        "characters": len(corpus_text),
        "words": len(corpus_text.split()),
        "documents": len(documents),
    },
    "split": {
        "policy": SPLIT_POLICY,
        "validation_fraction_default": 0.1,
        "split_is_generated_at_training_time": True,
        "tokenizer_is_trained_on_training_partition_only": True,
    },
    "deduplication": dedupe_stats,
    "review": {
        "status": "pending",
        "license_review_required": True,
        "factual_review_required": True,
        "pii_review_required": True,
        "notes": (
            "Seed-corpus origin is not recorded in the repository. Curriculum "
            "source files do not declare an assigned content license. Do not "
            "promote or publicly distribute a trained checkpoint until source, "
            "license, factuality, and privacy reviews are completed."
        ),
    },
    "sources": source_entries,
}
MANIFEST.write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
print({
    "qa_pairs_added": len(AUTHORED_PAIRS),
    "dialogues_added": len(AUTHORED_DIALOGUES),
    "dialogue_turns_added": sum(map(len, AUTHORED_DIALOGUES)),
    "characters": len(corpus_text),
    "words": len(corpus_text.split()),
    "documents": len(documents),
    "dedupe": dedupe_stats,
    "corpus_sha256": corpus_sha256,
    "manifest": str(MANIFEST),
})
