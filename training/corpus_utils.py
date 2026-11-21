"""Utilities for keeping standalone QA targets deterministic in training corpora."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

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


def load_corpus_manifest(
    corpus_path: str | Path,
    corpus_sha256: str,
    *,
    project_root: str | Path | None = None,
    expected_split_policy: str | None = None,
) -> dict[str, object]:
    """Validate a generated corpus sidecar and fingerprint all declared source files.

    A missing sidecar is allowed for ad-hoc smoke corpora, but is explicitly
    marked as requiring review. Project corpus manifests are strict: stale input
    hashes, changed corpus bytes, and paths escaping the repository are rejected.
    """
    source_path = Path(corpus_path)
    manifest_path = source_path.with_suffix(".manifest.json")
    if not manifest_path.is_file():
        return {
            "manifest_path": None,
            "manifest_sha256": None,
            "review_status": "missing",
            "license_review_required": True,
            "factual_review_required": True,
            "pii_review_required": True,
            "source_count": 0,
        }

    raw = manifest_path.read_bytes()
    try:
        manifest = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"Invalid corpus manifest: {manifest_path}") from exc

    if not isinstance(manifest, dict):
        raise ValueError("Corpus manifest root must be an object")
    if manifest.get("schema_version") != 1:
        raise ValueError("Unsupported corpus manifest schema")
    if manifest.get("manifest_type") != "qq-quantum-training-corpus":
        raise ValueError("Unsupported corpus manifest type")

    corpus_info = manifest.get("corpus")
    if not isinstance(corpus_info, dict) or corpus_info.get("sha256") != corpus_sha256:
        raise ValueError("Corpus bytes do not match the manifest SHA-256")

    split_info = manifest.get("split")
    if not isinstance(split_info, dict):
        raise ValueError("Corpus manifest has no split policy")
    if expected_split_policy and split_info.get("policy") != expected_split_policy:
        raise ValueError("Corpus manifest split policy does not match the trainer")

    sources = manifest.get("sources")
    if not isinstance(sources, list) or not sources:
        raise ValueError("Corpus manifest must list its source files")

    root = Path(project_root).resolve() if project_root is not None else Path(__file__).resolve().parents[1]
    for source in sources:
        if not isinstance(source, dict):
            raise ValueError("Invalid corpus source entry")
        relative = source.get("path")
        expected_hash = source.get("sha256")
        if not isinstance(relative, str) or not relative:
            raise ValueError("Corpus source entry is missing a relative path")
        relative_path = Path(relative)
        if relative_path.is_absolute() or ".." in relative_path.parts:
            raise ValueError("Corpus source path escapes the project")
        if not isinstance(expected_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", expected_hash):
            raise ValueError("Corpus source entry has an invalid SHA-256")
        resolved_path = (root / relative_path).resolve()
        try:
            resolved_path.relative_to(root)
        except ValueError as exc:
            raise ValueError("Corpus source path escapes the project") from exc
        if not resolved_path.is_file():
            raise ValueError(f"Corpus source file is missing: {relative}")
        actual_hash = hashlib.sha256(resolved_path.read_bytes()).hexdigest()
        if actual_hash != expected_hash:
            raise ValueError(f"Corpus source file changed since manifest creation: {relative}")

    review = manifest.get("review")
    if not isinstance(review, dict):
        raise ValueError("Corpus manifest has no review status")
    review_status = review.get("status")
    if review_status not in {"pending", "approved", "rejected"}:
        raise ValueError("Invalid corpus review status")
    flags = ("license_review_required", "factual_review_required", "pii_review_required")
    if any(not isinstance(review.get(flag), bool) for flag in flags):
        raise ValueError("Corpus manifest review flags must be booleans")

    return {
        "manifest_path": str(manifest_path),
        "manifest_sha256": hashlib.sha256(raw).hexdigest(),
        "review_status": review_status,
        "license_review_required": review["license_review_required"],
        "factual_review_required": review["factual_review_required"],
        "pii_review_required": review["pii_review_required"],
        "source_count": len(sources),
    }
