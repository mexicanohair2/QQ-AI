import tempfile
import unittest
from pathlib import Path

import torch

from qq_quantum.model.tokenizer import ByteBPETokenizer
from qq_quantum.model.training import _read_corpus, train
from qq_quantum.model.transformer import GPTConfig, QuantumGPT

ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT / "qq_quantum" / "data" / "seed_corpus.txt.gz.b64"


class TokenizerTests(unittest.TestCase):
    def test_unicode_round_trip(self):
        tokenizer = ByteBPETokenizer(320).train(
            "Привет, мир!\nQQ Quantum — тест.🙂漢字\n" * 8
        )
        sample = "Ёжик, мир 🌍 — QQ Quantum!\n漢字"
        self.assertEqual(tokenizer.decode(tokenizer.encode(sample)), sample)

    def test_special_tokens_and_persistence(self):
        tokenizer = ByteBPETokenizer(320).train("свой токенизатор " * 10)
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "tokenizer.json"
            tokenizer.save(path)
            loaded = ByteBPETokenizer.load(path)
            sample = "Привет 🙂"
            self.assertEqual(loaded.encode(sample), tokenizer.encode(sample))
            self.assertEqual(loaded.encode("<USER>"), [3])
            tokens = loaded.encode(sample, add_bos=True, add_eos=True)
            self.assertEqual(loaded.decode(tokens), "<BOS>" + sample + "<EOS>")
            self.assertEqual(loaded.decode(tokens, skip_special_tokens=True), sample)


class TransformerTests(unittest.TestCase):
    def test_forward_shape_and_causal_mask(self):
        torch.manual_seed(7)
        model = QuantumGPT(
            GPTConfig(vocab_size=300, block_size=16, n_layer=1, n_head=2, n_embd=16, dropout=0)
        ).eval()
        first = torch.tensor([[5, 6, 7, 8]], dtype=torch.long)
        changed_future = torch.tensor([[5, 6, 9, 10]], dtype=torch.long)
        logits_a, loss = model(first, torch.tensor([[6, 7, 8, 9]], dtype=torch.long))
        logits_b, _ = model(changed_future)
        self.assertEqual(tuple(logits_a.shape), (1, 4, 300))
        self.assertTrue(torch.isfinite(loss))
        self.assertTrue(torch.allclose(logits_a[:, :2], logits_b[:, :2], atol=1e-6, rtol=1e-6))

    def test_invalid_dimensions_are_rejected(self):
        with self.assertRaises(ValueError):
            GPTConfig(vocab_size=260).validate()


class TrainingTests(unittest.TestCase):
    def test_reads_plain_gzip_and_base64_gzip_corpus_files(self):
        import base64
        import gzip

        content = "QQ Quantum — тест Unicode 🙂\\nВторая строка."
        raw = content.encode("utf-8")
        with tempfile.TemporaryDirectory() as temp_dir:
            folder = Path(temp_dir)
            plain = folder / "corpus.txt"
            zipped = folder / "corpus.txt.gz"
            encoded = folder / "corpus.txt.gz.b64"
            plain.write_bytes(raw)
            zipped.write_bytes(gzip.compress(raw))
            encoded.write_bytes(base64.b64encode(gzip.compress(raw)))
            self.assertEqual(_read_corpus(plain), content)
            self.assertEqual(_read_corpus(zipped), content)
            self.assertEqual(_read_corpus(encoded), content)

    def setUp(self):
        self.previous_threads = torch.get_num_threads()
        torch.set_num_threads(1)

    def tearDown(self):
        torch.set_num_threads(self.previous_threads)

    def test_cpu_training_checkpoint_resume_and_generation(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            params = dict(
                corpus_path=str(CORPUS),
                output_dir=temp_dir,
                batch_size=2,
                block_size=32,
                learning_rate=1e-3,
                vocab_size=300,
                n_layer=1,
                n_head=2,
                n_embd=16,
                dropout=0,
                seed=41,
                device="cpu",
                checkpoint_interval=1,
            )
            result = train(max_steps=2, **params)
            checkpoint = Path(result["checkpoint"])
            tokenizer_path = Path(result["tokenizer"])
            self.assertTrue(checkpoint.is_file())
            self.assertTrue(tokenizer_path.is_file())
            self.assertEqual(result["device"], "cpu")
            self.assertEqual(result["steps_run"], 2)
            self.assertTrue(torch.isfinite(torch.tensor(result["last_loss"])))
            self.assertTrue(torch.isfinite(torch.tensor(result["validation_loss"])))

            resumed = train(max_steps=3, resume=True, **params)
            self.assertEqual(resumed["start_step"], 2)
            self.assertEqual(resumed["final_step"], 2)
            self.assertEqual(resumed["steps_run"], 1)

            saved = torch.load(checkpoint, map_location="cpu", weights_only=False)
            self.assertEqual(saved["format"], "qq-quantum-checkpoint-v2")
            self.assertEqual(saved["step"], 2)

            continuous_output = Path(temp_dir) / "continuous"
            continuous = train(
                corpus_path=str(CORPUS),
                output_dir=str(continuous_output),
                max_steps=3,
                batch_size=2,
                block_size=32,
                learning_rate=1e-3,
                vocab_size=300,
                n_layer=1,
                n_head=2,
                n_embd=16,
                dropout=0,
                seed=41,
                device="cpu",
                checkpoint_interval=1,
            )
            continuous_checkpoint = torch.load(
                continuous["checkpoint"], map_location="cpu", weights_only=False
            )
            for name, resumed_weight in saved["model"].items():
                self.assertTrue(
                    torch.equal(resumed_weight, continuous_checkpoint["model"][name]),
                    f"Resumed training diverged at {name}",
                )

            tokenizer = ByteBPETokenizer.load(tokenizer_path)
            model = QuantumGPT(GPTConfig(**saved["model_config"]))
            model.load_state_dict(saved["model"])
            prompt = torch.tensor([tokenizer.encode("QQ Quantum", add_bos=True)])
            torch.manual_seed(99)
            generated_a = model.generate(prompt, max_new_tokens=12, temperature=0.8, top_k=10)
            torch.manual_seed(99)
            generated_b = model.generate(prompt, max_new_tokens=12, temperature=0.8, top_k=10)
            self.assertTrue(torch.equal(generated_a, generated_b))
            self.assertGreaterEqual(generated_a.shape[1], prompt.shape[1])
            self.assertIsInstance(tokenizer.decode(generated_a[0].tolist(), skip_special_tokens=True), str)

    def test_resume_requires_existing_checkpoint(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            with self.assertRaises(FileNotFoundError):
                train(
                    corpus_path=str(CORPUS),
                    output_dir=temp_dir,
                    max_steps=1,
                    batch_size=1,
                    block_size=16,
                    vocab_size=280,
                    n_layer=1,
                    n_head=2,
                    n_embd=16,
                    dropout=0,
                    device="cpu",
                    resume=True,
                )


if __name__ == "__main__":
    unittest.main()
