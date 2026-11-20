"""Deterministic byte-level BPE tokenizer with validated JSON persistence."""
from __future__ import annotations

import base64
import json
from collections import Counter
from pathlib import Path
from typing import Iterable

SPECIAL_TOKENS = {"<PAD>": 0, "<BOS>": 1, "<EOS>": 2, "<USER>": 3, "<ASSISTANT>": 4}
BYTE_BASE = 5
MERGE_BASE = BYTE_BASE + 256

class ByteBPETokenizer:
    def __init__(self, vocab_size: int = 1024):
        if vocab_size < MERGE_BASE:
            raise ValueError(f"vocab_size must be >= {MERGE_BASE}")
        self.vocab_size = int(vocab_size)
        self.special_tokens = dict(SPECIAL_TOKENS)
        self.id_to_bytes: dict[int, bytes] = {BYTE_BASE + i: bytes([i]) for i in range(256)}
        self.merges: list[tuple[int, int, int]] = []
        self.real_size = MERGE_BASE
        self._merge_rank: dict[tuple[int, int], int] = {}

    @property
    def vocab(self) -> dict[int, bytes]:
        return dict(self.id_to_bytes)

    def train(self, text: str, vocab_size: int | None = None, min_frequency: int = 2):
        target = int(vocab_size or self.vocab_size)
        if target < MERGE_BASE:
            raise ValueError(f"vocab_size must be >= {MERGE_BASE}")
        self.vocab_size = target
        tokens = [BYTE_BASE + b for b in text.encode("utf-8")]
        self.id_to_bytes = {BYTE_BASE + i: bytes([i]) for i in range(256)}
        self.merges = []
        next_id = MERGE_BASE
        while next_id < target and len(tokens) > 1:
            counts = Counter(zip(tokens, tokens[1:]))
            if not counts:
                break
            best_count = max(counts.values())
            if best_count < min_frequency:
                break
            pair = min(p for p, count in counts.items() if count == best_count)
            merged_id = next_id
            self.id_to_bytes[merged_id] = self.id_to_bytes[pair[0]] + self.id_to_bytes[pair[1]]
            self.merges.append((pair[0], pair[1], merged_id))
            out, i = [], 0
            while i < len(tokens):
                if i + 1 < len(tokens) and (tokens[i], tokens[i + 1]) == pair:
                    out.append(merged_id); i += 2
                else:
                    out.append(tokens[i]); i += 1
            tokens = out
            next_id += 1
        self.real_size = next_id
        self._rebuild_ranks()
        return self

    def _rebuild_ranks(self):
        self._merge_rank = {(a, b): rank for rank, (a, b, _) in enumerate(self.merges)}

    def _encode_bytes(self, raw: bytes) -> list[int]:
        tokens = [BYTE_BASE + b for b in raw]
        while len(tokens) > 1:
            candidates = [(self._merge_rank[(tokens[i], tokens[i + 1])], i)
                for i in range(len(tokens) - 1) if (tokens[i], tokens[i + 1]) in self._merge_rank]
            if not candidates:
                break
            _, idx = min(candidates)
            pair = (tokens[idx], tokens[idx + 1])
            merge_id = self.merges[self._merge_rank[pair]][2]
            merged, i = [], 0
            while i < len(tokens):
                if i + 1 < len(tokens) and (tokens[i], tokens[i + 1]) == pair:
                    merged.append(merge_id); i += 2
                else:
                    merged.append(tokens[i]); i += 1
            tokens = merged
        return tokens

    def encode(self, text: str, add_bos: bool = False, add_eos: bool = False) -> list[int]:
        import re
        pattern = re.compile("(" + "|".join(re.escape(x) for x in sorted(self.special_tokens, key=len, reverse=True)) + ")")
        result = [self.special_tokens["<BOS>"]] if add_bos else []
        for part in pattern.split(text):
            if not part: continue
            if part in self.special_tokens: result.append(self.special_tokens[part])
            else: result.extend(self._encode_bytes(part.encode("utf-8")))
        if add_eos: result.append(self.special_tokens["<EOS>"])
        return result

    def decode(self, ids: Iterable[int], skip_special_tokens: bool = False) -> str:
        chunks = []
        reverse = {v: k for k, v in self.special_tokens.items()}
        for token_id in ids:
            token_id = int(token_id)
            if token_id in self.special_tokens.values():
                if not skip_special_tokens: chunks.append(reverse[token_id].encode("utf-8"))
            elif token_id in self.id_to_bytes: chunks.append(self.id_to_bytes[token_id])
            else: raise ValueError(f"Unknown token ID: {token_id}")
        return b"".join(chunks).decode("utf-8", errors="replace")

    def save(self, path: str | Path):
        payload = {
            "format": "qq-byte-bpe-v1", "vocab_size": self.vocab_size,
            "real_size": self.real_size, "special_tokens": self.special_tokens,
            "tokens": {str(i): base64.b64encode(b).decode("ascii") for i, b in self.id_to_bytes.items()},
            "merges": [list(x) for x in self.merges],
        }
        path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        tmp.replace(path)

    @classmethod
    def load(cls, path: str | Path):
        try:
            payload = json.loads(Path(path).read_text(encoding="utf-8"))
            if payload.get("format") != "qq-byte-bpe-v1": raise ValueError("Unsupported tokenizer format")
            obj = cls(int(payload["vocab_size"]))
            if payload["special_tokens"] != SPECIAL_TOKENS: raise ValueError("Invalid special token mapping")
            tokens = {int(i): base64.b64decode(v, validate=True) for i, v in payload["tokens"].items()}
            if set(tokens) != set(range(BYTE_BASE, int(payload["real_size"]))):
                raise ValueError("Token IDs are not contiguous")
            for i in range(BYTE_BASE, MERGE_BASE):
                if tokens.get(i) != bytes([i - BYTE_BASE]): raise ValueError("Base byte token is corrupted")
            merges, expected = [], MERGE_BASE
            for row in payload["merges"]:
                if not isinstance(row, list) or len(row) != 3: raise ValueError("Malformed merge entry")
                a, b, new_id = map(int, row)
                if new_id != expected or a not in tokens or b not in tokens or a >= new_id or b >= new_id:
                    raise ValueError("Invalid or non-contiguous merge IDs")
                if tokens[new_id] != tokens[a] + tokens[b]: raise ValueError("Merge byte sequence mismatch")
                merges.append((a, b, new_id)); expected += 1
            if expected != int(payload["real_size"]): raise ValueError("real_size does not match merge count")
            obj.id_to_bytes, obj.merges, obj.real_size = tokens, merges, expected
            obj._rebuild_ranks()
            return obj
        except (json.JSONDecodeError, UnicodeDecodeError, KeyError, TypeError, OSError) as exc:
            raise ValueError(f"Повреждённый JSON токенизатора: {exc}") from exc
