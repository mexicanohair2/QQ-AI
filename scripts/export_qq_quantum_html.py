#!/usr/bin/env python3
"""Export a trained QQ Quantum checkpoint into a self-contained offline HTML package."""
from __future__ import annotations

import argparse
import base64
import gzip
import hashlib
import json
import math
from pathlib import Path
import sys
import subprocess
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import numpy as np
import torch

from qq_quantum.model.tokenizer import ByteBPETokenizer
from qq_quantum.model.training import _read_corpus, completed_training_step
from qq_quantum.model.transformer import GPTConfig, QuantumGPT

ASSET_FORMAT = "qq-quantum-web-weights-v1"
TOKENIZER_FORMAT = "qq-byte-bpe-v1"
MAX_HTML_BYTES = 8 * 1024 * 1024
MAX_WEIGHTS_BASE64 = 6 * 1024 * 1024
SUPPORTED_CHECKPOINT_FORMATS = {"qq-quantum-checkpoint-v2", "qq-quantum-sft-v1"}
DEFAULT_MODEL_DIR = ROOT / "qq_quantum/artifacts/model-dialogue-v4-sft-refine-best"
DEFAULT_CORPUS = ROOT / "training/data/qq_quantum_dialogue_v2.txt"


def _safe_json(value: Any) -> str:
    """Serialize JSON without creating a script-closing sequence in the HTML."""
    return (
        json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        .replace("<", r"\u003c")
        .replace(">", r"\u003e")
        .replace("&", r"\u0026")
    )


def ensure_curriculum_corpus(corpus_path: Path) -> None:
    """Build the tracked, authored curriculum when a clean checkout has no generated corpus.""¶»§q«^