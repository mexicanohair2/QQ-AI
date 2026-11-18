#!/usr/bin/env python3
"""Validate provenance and structure for QQ AI supervised fine-tuning JSONL.

This tool validates metadata and basic structure only. It cannot establish that a
license is genuine or that a dataset contains no personal/sensitive information.
Human review remains mandatory before any training run.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

ALLOWED_SPLITS = {"train", "validation", "test"}
ALLOWED_LICENSES = {
    "CC0-1.0",
    "CC-BY-4.0",
    "Apache-2.0",
    "MIT",
    "public-domain",
    "custom-consented",
}
ALLOWED_SOURCE_KINDS = {"authored", "licensed", "public-domain", "consented"}
SECRET_PATTERNS = [
    re.compile(r"\b(?:sk-proj-|sk_live_|ghp_|github_pat_|hf_[A-Za-z0-9]{10,})", re.I),
    re.compile(r"\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
]
EMAIL_PATTERN = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
PHONE_PATTERN = re.compile(r"(?<!\w)(?:\+?\d[\d ()-]{8,}\d)(?!\w)")


class DatasetError(ValueError):
    pass


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().casefold()


def validate_record(record: Any, line_number: int) -> tuple[str, str]:
    prefix = f"line {line_number}: "
    if not isinstance(record, dict):
        raise DatasetError(prefix + "record must be a JSON object")

    required = {"id", "split", "license", "source", "messages"}
    missing = required - set(record)
    if missing:
        raise DatasetError(prefix + "missing fields: " + ", ".join(sorted(missing)))

    if not isinstance(record["id"], str) or not record["id"].strip():
        raise DatasetError(prefix + "id must be a non-empty string")
    if record["split"] not in ALLOWED_SPLITS:
        raise DatasetError(prefix + "split must be train, validation, or test")
    if record["license"] not in ALLOWED_LICENSES:
        raise DatasetError(prefix + "license is not in the approved allow-list")

    source = record["source"]
    if not isinstance(source, dict) or source.get("kind") not in ALLOWED_SOURCE_KINDS:
        raise DatasetError(prefix + "source.kind must document authorship, license, public domain, or consent")
    if not isinstance(source.get("reference"), str) or not source["reference"].strip():
        raise DatasetError(prefix + "source.reference is required")
    if source["kind"] == "consented" and not source.get("consent_reference"):
        raise DatasetError(prefix + "consented records require consent_reference")
    if source["kind"] == "licensed" and record["license"] in {"custom-consented", "public-domain"}:
        raise DatasetError(prefix + "licensed source requires a specific approved license")

    messages = record["messages"]
    if not isinstance(messages, list) or len(messages) < 2 or len(messages) > 16:
        raise DatasetError(prefix + "messages must contain 2 to 16 entries")
    normalized_parts: list[str] = []
    roles: list[str] = []
    for message in messages:
        if not isinstance(message, dict) or message.get("role") not in {"system", "user", "assistant"}:
            raise DatasetError(prefix + "each message needs a valid role")
        text = message.get("content")
        if not isinstance(text, str) or not text.strip() or len(text) > 20000:
            raise DatasetError(prefix + "message content must be non-empty and at most 20000 characters")
        roles.append(message["role"])
        normalized_parts.append(normalize_text(text))
        if any(pattern.search(text) for pattern in SECRET_PATTERNS):
            raise DatasetError(prefix + "possible credential/token detected")
        if EMAIL_PATTERN.search(text) or PHONE_PATTERN.search(text):
            raise DatasetError(prefix + "possible personal contact information detected")

    if roles[-1] != "assistant" or "user" not in roles:
        raise DatasetError(prefix + "conversation must contain a user message and end with assistant")
    if roles.count("assistant") == 0:
        raise DatasetError(prefix + "assistant response is required")
    if "tags" in record and (
        not isinstance(record["tags"], list) or
        not all(isinstance(tag, str) and len(tag) <= 64 for tag in record["tags"])
    ):
        raise DatasetError(prefix + "tags must be an array of short strings")

    fingerprint = "\n".join(normalized_parts)
    return record["split"], fingerprint


def validate_file(path: Path) -> dict[str, int]:
    counts = {split: 0 for split in sorted(ALLOWED_SPLITS)}
    seen_ids: set[str] = set()
    seen_fingerprints: dict[str, str] = {}
    total = 0

    with path.open("r", encoding="utf-8") as stream:
        for line_number, raw in enumerate(stream, start=1):
            if not raw.strip():
                continue
            try:
                record = json.loads(raw)
            except json.JSONDecodeError as exc:
                raise DatasetError(f"line {line_number}: invalid JSON: {exc.msg}") from exc
            split, fingerprint = validate_record(record, line_number)
            record_id = record["id"]
            if record_id in seen_ids:
                raise DatasetError(f"line {line_number}: duplicate id {record_id!r}")
            if fingerprint in seen_fingerprints:
                raise DatasetError(
                    f"line {line_number}: duplicate conversation across dataset "
                    f"(first seen on line {seen_fingerprints[fingerprint]})"
                )
            seen_ids.add(record_id)
            seen_fingerprints[fingerprint] = str(line_number)
            counts[split] += 1
            total += 1

    if total == 0:
        raise DatasetError("dataset is empty")
    counts["total"] = total
    return counts


def self_test() -> None:
    sample = {
        "id": "self-test-001",
        "split": "train",
        "license": "CC0-1.0",
        "source": {"kind": "authored", "reference": "QQ AI synthetic validator fixture"},
        "messages": [
            {"role": "user", "content": "Сколько будет 2 + 2?"},
            {"role": "assistant", "content": "4."},
        ],
    }
    validate_record(sample, 1)
    bad = dict(sample)
    bad["messages"] = [
        {"role": "user", "content": "Напиши тестовое письмо на test@example.com"},
        {"role": "assistant", "content": "Пример."},
    ]
    try:
        validate_record(bad, 2)
    except DatasetError:
        return
    raise DatasetError("self-test failed to detect personal contact data")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", nargs="?", type=Path, help="UTF-8 JSONL dataset path")
    parser.add_argument("--self-test", action="store_true", help="run validator self-tests without a dataset")
    args = parser.parse_args()

    try:
        if args.self_test:
            self_test()
            print("QQ AI training-data validator self-test passed.")
            return 0
        if args.dataset is None:
            parser.error("provide a dataset path or use --self-test")
        counts = validate_file(args.dataset)
        print(json.dumps({"valid": True, "counts": counts}, ensure_ascii=False, indent=2))
        print("Note: license provenance and privacy still require human review.")
        return 0
    except (OSError, UnicodeError, DatasetError) as exc:
        print(f"Dataset validation failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
