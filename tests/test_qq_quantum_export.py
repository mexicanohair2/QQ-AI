import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import torch

from qq_quantum.model.tokenizer import ByteBPETokenizer
from qq_quantum.model.transformer import GPTConfig, QuantumGPT
from scripts.export_qq_quantum_html import build_assets, render_html


class BrowserExportTests(unittest.TestCase):
    def test_export_contains_complete_float32_state_and_valid_html(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            corpus_path = folder / "corpus.txt"
            corpus_path.write_text(
                "QQ Quantum — контрольный корпус. Привет, мир! "
                "Модель должна работать без интернета.\\n" * 8,
                encoding="utf-8",
            )
            tokenizer = ByteBPETokenizer(261).train(
                corpus_path.read_text(encoding="utf-8"),
                vocab_size=261,
                min_frequency=999999,
            )
            tokenizer_path = folder / "tokenizer.json"
            tokenizer.save(tokenizer_path)

            torch.manual_seed(73)
            config = GPTConfig(
                vocab_size=tokenizer.real_size,
                block_size=8,
                n_layer=1,
                n_head=1,
                n_embd=4,
                dropout=0,
            )
            model = QuantumGPT(config).eval()
            checkpoint_path = folder / "latest.pt"
            torch.save(
                {
                    "format": "qq-quantum-checkpoint-v2",
                    "step": 2,
                    "loss": 1.0,
                    "validation_loss": 1.2,
                    "model_config": model.config_dict(),
                    "model": model.state_dict(),
                },
                checkpoint_path,
            )

            assets, raw_weights = build_assets(
                checkpoint_path, tokenizer_path, corpus_path
            )
            self.assertEqual(assets["metadata"]["format"], "qq-quantum-web-weights-v1")
            self.assertEqual(assets["metadata"]["training_step"], 3)
            self.assertEqual(assets["metadata"]["weight_bytes"], len(raw_weights))
            self.assertEqual(
                assets["metadata"]["weights_sha256"],
                hashlib.sha256(raw_weights).hexdigest(),
            )
            self.assertEqual(
                assets["tokenizer"]["real_size"],
                assets["metadata"]["model_config"]["vocab_size"],
            )
            self.assertIn("token_embedding.weight", assets["metadata"]["tensors"])
            self.assertIn("lm_head.weight", assets["metadata"]["tensors"])

            html = render_html(assets).decode("utf-8")
            self.assertTrue(html.startswith("<!doctype html>"))
            self.assertIn("const QQ_ASSETS = {", html)
            start = html.index("const QQ_ASSETS = ") + len("const QQ_ASSETS = ")
            depth = 0
            in_string = False
            escaped = False
            end = None
            for index, char in enumerate(html[start:], start):
                if in_string:
                    if escaped:
                        escaped = False
                    elif char == "\\\\":
                        escaped = True
                    elif char == '"':
                        in_string = False
                    continue
                if char == '"':
                    in_string = True
                elif char in "{[":
                    depth += 1
                elif char in "}]":
                    depth -= 1
                    if depth == 0:
                        end = index + 1
                        break
            self.assertIsNotNone(end)
            asset_json = html[start:end]
            self.assertNotIn("</script>", asset_json.lower())
            restored = json.loads(asset_json)
            self.assertEqual(restored, assets)


if __name__ == "__main__":
    unittest.main()
