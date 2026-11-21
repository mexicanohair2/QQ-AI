import hashlib
import tempfile
import unittest
from pathlib import Path

import torch

from qq_quantum.dialogue import DIALOGUE_PREFIX, SYSTEM_PREFIX
from qq_quantum.model.tokenizer import ByteBPETokenizer
from qq_quantum.model.training import train
from qq_quantum.sft import build_sft_samples, parse_dialogue_document, train_sft


class DialogueParsingTests(unittest.TestCase):
    def test_parses_single_turn_and_ignores_training_header(self):
        document = (
            "Ты QQ Quantum — экспериментальная языковая модель.\n"
            "Пользователь: Привет, как тебя зовут?\n"
            "QQ Quantum: Меня зовут QQ Quantum."
        )
        self.assertEqual(
            parse_dialogue_document(document),
            [
                {"role": "user", "content": "Привет, как тебя зовут?"},
                {"role": "assistant", "content": "Меня зовут QQ Quantum."},
            ],
        )

    def test_parses_complete_multi_turn_dialogue_in_order(self):
        document = (
            "Диалог 1. Продолжай разговор, учитывая предыдущие сообщения.\n"
            "Пользователь: Расскажи про космос.\n"
            "QQ Quantum: Космос — огромное пространство.\n"
            "Пользователь: А что такое галактика?\n"
            "QQ Quantum: Галактика — система звёзд, газа и пыли."
        )
        turns = parse_dialogue_document(document)
        self.assertEqual(
            [turn["role"] for turn in turns],
            ["user", "assistant", "user", "assistant"],
        )
        self.assertEqual(turns[-1]["content"], "Галактика — система звёзд, газа и пыли.")

    def test_rejects_incomplete_and_non_alternating_dialogues(self):
        self.assertEqual(parse_dialogue_document("Пользователь: Вопрос без ответа."), [])
        self.assertEqual(
            parse_dialogue_document(
                "Пользователь: Первый вопрос.\n"
                "Пользователь: Второй вопрос.\n"
                "QQ Quantum: Ответ."
            ),
            [],
        )


class SupervisedFineTuningTests(unittest.TestCase):
    def setUp(self):
        self.previous_threads = torch.get_num_threads()
        torch.set_num_threads(1)
        self.documents = [
            (
                f"{SYSTEM_PREFIX}\n"
                "Учебный материал описывает примеры, объяснения и проверку знаний.\n"
                "Диалог 1. Продолжай разговор, учитывая предыдущие сообщения.\n"
                f"Пользователь: Вопрос номер {index}: что такое алгоритм?\n"
                f"QQ Quantum: Алгоритм — это последовательность шагов номер {index}.\n"
                f"Пользователь: Приведи уточнение номер {index}.\n"
                f"QQ Quantum: Это второй ответ для примера номер {index}."
            )
            for index in range(12)
        ]
        self.corpus = "\n\n".join(self.documents)

    def tearDown(self):
        torch.set_num_threads(self.previous_threads)

    def tokenizer(self):
        return ByteBPETokenizer(1024).train(
            self.corpus + "\n" + SYSTEM_PREFIX, vocab_size=1024
        )

    def test_builds_assistant_only_labels_and_preserves_history(self):
        tokenizer = self.tokenizer()
        train_samples, validation_samples = build_sft_samples(
            self.corpus,
            tokenizer,
            block_size=128,
            validation_fraction=0.2,
            seed=7,
            max_answer_tokens=12,
        )
        self.assertGreater(len(train_samples), 0)
        self.assertGreater(len(validation_samples), 0)
        sample = next(item for item in train_samples if "Это второй ответ" in item["target_text"])
        prompt_length = sample["prompt_token_count"]
        self.assertEqual(
            sample["labels"][:prompt_length - 1],
            [-100] * (prompt_length - 1),
        )
        self.assertTrue(any(label != -100 for label in sample["labels"][prompt_length - 1:]))
        self.assertIn("QQ Quantum: Алгоритм — это последовательность шагов", sample["prompt_text"])
        self.assertTrue(sample["prompt_text"].startswith(DIALOGUE_PREFIX))
        self.assertLessEqual(len(sample["input_ids"]), 128)
        self.assertEqual(
            {sample["document_id"] for sample in train_samples}
            & {sample["document_id"] for sample in validation_samples},
            set(),
        )

    def test_single_turn_samples_use_system_prompt_and_mask_only_prompt(self):
        text = "\n\n".join(
            f"{SYSTEM_PREFIX}\nПользователь: Что такое число {index}?\n"
            f"QQ Quantum: Число {index} — учебный пример."
            for index in range(8)
        )
        tokenizer = ByteBPETokenizer(1024).train(text, vocab_size=1024)
        train_samples, validation_samples = build_sft_samples(
            text, tokenizer, block_size=128, seed=9
        )
        self.assertTrue(train_samples)
        self.assertTrue(validation_samples)
        sample = train_samples[0]
        self.assertTrue(sample["prompt_text"].startswith(SYSTEM_PREFIX))
        self.assertEqual(
            sample["labels"][:sample["prompt_token_count"] - 1],
            [-100] * (sample["prompt_token_count"] - 1),
        )

    def test_limits_context_and_answer_to_model_block_size(self):
        text = "\n\n".join(
            f"{SYSTEM_PREFIX}\n"
            f"Пользователь: {'Очень длинный вопрос ' * 30} номер {index}?\n"
            f"QQ Quantum: {'Длинный ответ с пояснением ' * 30} номер {index}."
            for index in range(8)
        )
        tokenizer = ByteBPETokenizer(1024).train(text, vocab_size=1024)
        train_samples, validation_samples = build_sft_samples(
            text, tokenizer, block_size=128, seed=2, max_answer_tokens=12
        )
        self.assertTrue(train_samples)
        self.assertTrue(validation_samples)
        for sample in train_samples + validation_samples:
            self.assertLessEqual(len(sample["input_ids"]), 128)
            self.assertLessEqual(len(sample["labels"]), 128)
            self.assertLessEqual(sample["prompt_token_count"], 128)

    def test_requested_answer_budget_is_not_silently_reduced_to_twelve_tokens(self):
        text = "\n\n".join(
            f"Пользователь: Объясни длинный пример номер {index}.\n"
            f"QQ Quantum: Подробный ответ номер {index}: " +
            " ".join(f"слово{word}" for word in range(90)) + "."
            for index in range(10)
        )
        tokenizer_text = (
            SYSTEM_PREFIX + " Пользователь вопрос ответ алгоритм объяснение значение пример текст. "
        ) * 100
        tokenizer = ByteBPETokenizer(1024).train(tokenizer_text, vocab_size=1024)
        train_samples, validation_samples = build_sft_samples(
            text,
            tokenizer,
            block_size=128,
            seed=21,
            max_answer_tokens=64,
        )
        samples = train_samples + validation_samples
        supervised = [
            sum(label != -100 for label in sample["labels"])
            for sample in samples
        ]
        self.assertTrue(supervised)
        self.assertTrue(any(count > 12 for count in supervised))
        self.assertTrue(all(count <= 65 for count in supervised))

    def _create_pretrained_checkpoint(self, corpus_path: Path, pretrained_dir: Path):
        return train(
            corpus_path=str(corpus_path),
            output_dir=str(pretrained_dir),
            max_steps=1,
            batch_size=2,
            block_size=80,
            learning_rate=1e-3,
            vocab_size=512,
            n_layer=1,
            n_head=2,
            n_embd=16,
            dropout=0,
            seed=33,
            device="cpu",
            checkpoint_interval=1,
            validation_fraction=0.1,
        )

    def test_sft_rejects_pretraining_checkpoint_without_provenance(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            corpus_path = root / "corpus.txt"
            corpus_path.write_text(self.corpus, encoding="utf-8")
            pretrained_dir = root / "pretrained"
            pretrained_dir.mkdir(parents=True)
            tokenizer = self.tokenizer()
            torch.save({
                "format": "qq-quantum-checkpoint-v2",
                "step": 0,
                "model_config": {
                    "vocab_size": tokenizer.real_size,
                    "block_size": 80,
                    "n_layer": 1,
                    "n_head": 2,
                    "n_embd": 16,
                    "dropout": 0,
                },
                "model": {},
                "training": {},
            }, pretrained_dir / "latest.pt")
            tokenizer.save(pretrained_dir / "tokenizer.json")
            with self.assertRaisesRegex(ValueError, "missing corpus and tokenizer provenance"):
                train_sft(
                    corpus_path=str(corpus_path),
                    pretrained_dir=str(pretrained_dir),
                    output_dir=str(root / "sft"),
                    max_steps=1,
                    batch_size=2,
                    seed=33,
                    device="cpu",
                    checkpoint_interval=1,
                    max_answer_tokens=40,
                )

    def test_sft_rejects_pretraining_corpus_mismatch(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            corpus_path = root / "corpus.txt"
            corpus_path.write_text(self.corpus, encoding="utf-8")
            pretrained_dir = root / "pretrained"
            self._create_pretrained_checkpoint(corpus_path, pretrained_dir)
            changed_corpus = root / "changed-corpus.txt"
            changed_corpus.write_text(self.corpus + "\n\nДополнительный документ.", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "corpus_sha256"):
                train_sft(
                    corpus_path=str(changed_corpus),
                    pretrained_dir=str(pretrained_dir),
                    output_dir=str(root / "sft"),
                    max_steps=1,
                    batch_size=2,
                    seed=33,
                    device="cpu",
                    checkpoint_interval=1,
                    max_answer_tokens=40,
                )

    def test_sft_training_writes_loadable_own_model_checkpoint(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            corpus_path = root / "corpus.txt"
            corpus_path.write_text(self.corpus, encoding="utf-8")
            pretrained_dir = root / "pretrained"
            self._create_pretrained_checkpoint(corpus_path, pretrained_dir)

            result = train_sft(
                corpus_path=str(corpus_path),
                pretrained_dir=str(pretrained_dir),
                output_dir=str(root / "sft"),
                max_steps=2,
                batch_size=2,
                learning_rate=1e-3,
                seed=33,
                device="cpu",
                checkpoint_interval=1,
                max_answer_tokens=40,
            )
            self.assertEqual(result["steps_run"], 2)
            self.assertGreater(result["train_samples"], 0)
            self.assertGreater(result["validation_samples"], 0)
            self.assertTrue(torch.isfinite(torch.tensor(result["last_loss"])))
            checkpoint = torch.load(result["checkpoint"], map_location="cpu", weights_only=False)
            self.assertEqual(checkpoint["format"], "qq-quantum-sft-v1")
            self.assertIn("model", checkpoint)
            self.assertEqual(
                checkpoint["training"]["pretrained_tokenizer_sha256"],
                hashlib.sha256((pretrained_dir / "tokenizer.json").read_bytes()).hexdigest(),
            )
            self.assertTrue((root / "sft" / "best.pt").is_file())
            self.assertTrue((root / "sft" / "tokenizer.json").is_file())



if __name__ == "__main__":
    unittest.main()
