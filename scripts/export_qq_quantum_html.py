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
    """Build the tracked, authored curriculum when a clean checkout has no generated corpus."""
    if corpus_path.is_file():
        return
    if corpus_path.resolve() != DEFAULT_CORPUS.resolve():
        raise FileNotFoundError(f"Corpus file does not exist: {corpus_path}")
    builder = ROOT / "training" / "build_dialogue_corpus.py"
    subprocess.run([sys.executable, str(builder)], cwd=ROOT, check=True)
    if not corpus_path.is_file():
        raise RuntimeError("The QQ Quantum corpus builder completed without creating its output.")


def build_assets(
    checkpoint_path: Path,
    tokenizer_path: Path,
    corpus_path: Path,
) -> tuple[dict[str, Any], bytes]:
    ensure_curriculum_corpus(corpus_path)
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    checkpoint_format = checkpoint.get("format")
    if checkpoint_format not in SUPPORTED_CHECKPOINT_FORMATS:
        raise ValueError(f"Unsupported QQ Quantum checkpoint format: {checkpoint_format!r}")

    config_data = checkpoint.get("model_config")
    if not isinstance(config_data, dict):
        raise ValueError("Checkpoint has no model_config")
    config = GPTConfig(**config_data)
    config.validate()

    model = QuantumGPT(config).cpu().eval()
    model.load_state_dict(checkpoint["model"], strict=True)
    tokenizer = ByteBPETokenizer.load(tokenizer_path)
    if tokenizer.real_size != config.vocab_size:
        raise ValueError("Tokenizer vocabulary and model vocabulary do not match")

    tensors: dict[str, dict[str, Any]] = {}
    chunks: list[bytes] = []
    offset = 0

    # State-dict key names are the stable contract consumed by the browser runtime.
    for name, tensor in model.state_dict().items():
        if not isinstance(tensor, torch.Tensor):
            raise TypeError(f"Unexpected non-tensor state entry: {name}")
        array = tensor.detach().cpu().to(dtype=torch.float32).contiguous().numpy()
        if not np.isfinite(array).all():
            raise ValueError(f"Non-finite values in model tensor: {name}")
        raw = array.astype("<f4", copy=False).tobytes(order="C")
        if offset % 4:
            padding = 4 - (offset % 4)
            chunks.append(b"\0" * padding)
            offset += padding
        tensors[name] = {
            "offset": offset,
            "length": int(array.size),
            "shape": [int(dimension) for dimension in array.shape],
        }
        chunks.append(raw)
        offset += len(raw)

    weights = b"".join(chunks)
    tokenizer_payload = json.loads(Path(tokenizer_path).read_text(encoding="utf-8"))
    if tokenizer_payload.get("format") != TOKENIZER_FORMAT:
        raise ValueError("Unsupported tokenizer format")

    corpus = _read_corpus(corpus_path)
    validation_loss = checkpoint.get("validation_loss")
    if validation_loss is not None and not math.isfinite(float(validation_loss)):
        raise ValueError("Checkpoint validation loss must be finite")

    compressed = gzip.compress(weights, compresslevel=9, mtime=0)
    encoded_weights = base64.b64encode(compressed).decode("ascii")
    if len(encoded_weights) > MAX_WEIGHTS_BASE64:
        raise ValueError(
            f"Compressed model weights exceed browser package limit: "
            f"{len(encoded_weights)} > {MAX_WEIGHTS_BASE64}"
        )

    metadata = {
        "format": ASSET_FORMAT,
        "checkpoint_format": checkpoint_format,
        "training_step": completed_training_step(checkpoint),
        "validation_loss": float(validation_loss) if validation_loss is not None else None,
        "weight_bytes": len(weights),
        "weights_sha256": hashlib.sha256(weights).hexdigest(),
        "model_config": config_data,
        "tensors": tensors,
    }
    assets = {
        "metadata": metadata,
        "tokenizer": tokenizer_payload,
        "corpus": corpus,
        "weights_gzip_base64": encoded_weights,
    }
    return assets, weights


def render_html(assets: dict[str, Any]) -> bytes:
    json_text = _safe_json(assets)
    html = (
        "<!doctype html>\n"
        '<html lang="ru">\n<head>\n'
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
        "<title>QQ Quantum Offline — model package</title>\n"
        "</head>\n<body>\n"
        "<!-- QQ Quantum model asset package. Import this file into QQ AI; "
        "the file itself does not run a remote model. -->\n"
        "<script>\n"
        f"const QQ_ASSETS = {json_text};\n"
        "</script>\n"
        "</body>\n</html>\n"
    ).encode("utf-8")
    if len(html) > MAX_HTML_BYTES:
        raise ValueError(
            f"Offline HTML package exceeds importer limit: {len(html)} > {MAX_HTML_BYTES}"
        )
    return html


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", type=Path, default=DEFAULT_MODEL_DIR / "latest.pt")
    parser.add_argument("--tokenizer", type=Path, default=DEFAULT_MODEL_DIR / "tokenizer.json")
    parser.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    parser.add_argument("--output", type=Path, default=DEFAULT_MODEL_DIR / "QQ_Quantum_Offline.html")
    parser.add_argument("--assets-output", type=Path, help="Also write standalone JSON assets for automatic website loading.")
    args = parser.parse_args()

    assets, weights = build_assets(args.checkpoint, args.tokenizer, args.corpus)
    html = render_html(assets)
    if args.assets_output:
        args.assets_output.parent.mkdir(parents=True, exist_ok=True)
        assets_bytes = (_safe_json(assets) + "\\n").encode("utf-8")
        assets_temporary = args.assets_output.with_suffix(args.assets_output.suffix + ".tmp")
        assets_temporary.write_bytes(assets_bytes)
        assets_temporary.replace(args.assets_output)
        manifest = {
            "format": "qq-quantum-web-manifest-v1",
            "weights_sha256": assets["metadata"]["weights_sha256"],
            "training_step": assets["metadata"]["training_step"],
            "asset_path": args.assets_output.name,
        }
        manifest_path = args.assets_output.with_name("manifest.json")
        manifest_temporary = manifest_path.with_suffix(".json.tmp")
        manifest_temporary.write_text(_safe_json(manifest) + "\\n", encoding="utf-8")
        manifest_temporary.replace(manifest_path)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(args.output.suffix + ".tmp")
    temporary.write_bytes(html)
    temporary.replace(args.output)

    print(json.dumps({
        "exported": True,
        "output": str(args.output),
        "assets_output": str(args.assets_output) if args.assets_output else None,
        "assets_bytes": len(assets_bytes) if args.assets_output else None,
        "html_bytes": len(html),
        "weights_bytes": assets["metadata"]["weight_bytes"],
        "weights_gzip_base64_chars": len(assets["weights_gzip_base64"]),
        "weights_sha256": assets["metadata"]["weights_sha256"],
        "model_sha256": hashlib.sha256(html).hexdigest(),
        "checkpoint_format": assets["metadata"]["checkpoint_format"],
        "training_step": assets["metadata"]["training_step"],
        "model_config": assets["metadata"]["model_config"],
        "tensor_count": len(assets["metadata"]["tensors"]),
        "parameters": sum(item["length"] for name, item in assets["metadata"]["tensors"].items()),
        "validation_loss": assets["metadata"]["validation_loss"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
