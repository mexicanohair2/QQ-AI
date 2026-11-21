import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from training.corpus_utils import deduplicate_standalone_qa_documents, load_corpus_manifest


class CorpusManifestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.corpus_path = self.root / "data" / "corpus.txt"
        self.corpus_path.parent.mkdir(parents=True)
        self.corpus = "QQ Quantum — тестовый корпус."
        self.corpus_path.write_text(self.corpus, encoding="utf-8")
        self.source_path = self.root / "training" / "source.py"
        self.source_path.parent.mkdir(parents=True)
        self.source_path.write_text("SOURCE = 'authored'\n", encoding="utf-8")
        self.policy = "seeded-normalized-document-group-split-v3"

    def tearDown(self):
        self.temp.cleanup()

    def write_manifest(self, *, corpus_text=None, source_hash=None):
        corpus_text = self.corpus if corpus_text is None else corpus_text
        source_hash = source_hash or hashlib.sha256(self.source_path.read_bytes()).hexdigest()
        manifest = {
            "schema_version": 1,
            "manifest_type": "qq-quantum-training-corpus",
            "corpus": {"sha256": hashlib.sha256(corpus_text.encode("utf-8")).hexdigest()},
            "split": {"policy": self.policy},
            "review": {
                "status": "pending",
                "license_review_required": True,
                "factual_review_required": True,
                "pii_review_required": True,
            },
            "sources": [{"path": "training/source.py", "sha256": source_hash}],
        }
        manifest_path = self.corpus_path.with_suffix(".manifest.json")
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        return manifest_path

    def test_missing_manifest_is_marked_unreviewed(self):
        result = load_corpus_manifest(
            self.corpus_path,
            hashlib.sha256(self.corpus.encode("utf-8")).hexdigest(),
            project_root=self.root,
            expected_split_policy=self.policy,
        )
        self.assertEqual(result["review_status"], "missing")
        self.assertTrue(result["license_review_required"])

    def test_valid_manifest_checks_corpus_source_and_split_policy(self):
        manifest_path = self.write_manifest()
        result = load_corpus_manifest(
            self.corpus_path,
            hashlib.sha256(self.corpus.encode("utf-8")).hexdigest(),
            project_root=self.root,
            expected_split_policy=self.policy,
        )
        self.assertEqual(result["review_status"], "pending")
        self.assertEqual(result["source_count"], 1)
        self.assertEqual(result["manifest_path"], str(manifest_path))
        self.assertEqual(
            result["manifest_sha256"],
            hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
        )

    def test_rejects_manifest_when_corpus_bytes_change(self):
        self.write_manifest()
        with self.assertRaisesRegex(ValueError, "Corpus bytes"):
            load_corpus_manifest(
                self.corpus_path,
                hashlib.sha256(b"changed").hexdigest(),
                project_root=self.root,
                expected_split_policy=self.policy,
            )

    def test_rejects_manifest_when_a_declared_source_changes(self):
        self.write_manifest()
        self.source_path.write_text("SOURCE = 'changed'\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "source file changed"):
            load_corpus_manifest(
                self.corpus_path,
                hashlib.sha256(self.corpus.encode("utf-8")).hexdigest(),
                project_root=self.root,
                expected_split_policy=self.policy,
            )

    def test_rejects_manifest_using_a_different_split_policy(self):
        self.write_manifest()
        with self.assertRaisesRegex(ValueError, "split policy"):
            load_corpus_manifest(
                self.corpus_path,
                hashlib.sha256(self.corpus.encode("utf-8")).hexdigest(),
                project_root=self.root,
                expected_split_policy="another-policy",
            )


class StandaloneCorpusDeduplicationTests(unittest.TestCase):
    def test_last_authored_answer_wins_for_conflicting_prompt(self):
        corpus = "\n\n".join([
            "Пользователь: Что такое алгоритм?\nQQ Quantum: Старый ответ.",
            "Пользователь: Как устроена переменная?\nQQ Quantum: Переменная хранит значение.",
            "Ты QQ Quantum — новая версия.\nПользователь: ЧТО ТАКОЕ АЛГОРИТМ!!!\nQQ Quantum: Новый точный ответ.",
        ])
        cleaned, stats = deduplicate_standalone_qa_documents(corpus)
        self.assertNotIn("Старый ответ", cleaned)
        self.assertIn("Новый точный ответ", cleaned)
        self.assertIn("Переменная хранит значение", cleaned)
        self.assertEqual(stats["standalone_documents_before"], 3)
        self.assertEqual(stats["standalone_documents_after"], 2)
        self.assertEqual(stats["duplicate_standalone_documents_removed"], 1)

    def test_preserves_multi_turn_dialogues_with_repeated_questions(self):
        dialogue = (
            "Диалог 1. Продолжай разговор.\n"
            "Пользователь: Привет!\n"
            "QQ Quantum: Здравствуйте!\n"
            "Пользователь: Привет!\n"
            "QQ Quantum: Продолжим разговор."
        )
        corpus = "\n\n".join([
            "Пользователь: Привет!\nQQ Quantum: Привет!",
            dialogue,
        ])
        cleaned, stats = deduplicate_standalone_qa_documents(corpus)
        self.assertIn(dialogue, cleaned)
        self.assertEqual(cleaned.count("Пользователь: Привет!"), 3)
        self.assertEqual(stats["standalone_documents_after"], 1)

    def test_preserves_non_qa_source_documents_and_comments(self):
        corpus = "\n\n".join([
            "QQ Quantum — учебный корпус.",
            "# Комментарий корпуса",
            "Пользователь: Что такое вода?\nQQ Quantum: Вода — вещество.",
        ])
        cleaned, stats = deduplicate_standalone_qa_documents(corpus)
        self.assertIn("QQ Quantum — учебный корпус.", cleaned)
        self.assertIn("# Комментарий корпуса", cleaned)
        self.assertEqual(stats["standalone_documents_after"], 1)

    def test_identical_answers_are_also_deduplicated(self):
        pair = "Пользователь: Что такое свет?\nQQ Quantum: Свет — электромагнитное излучение."
        cleaned, stats = deduplicate_standalone_qa_documents(pair + "\n\n" + pair)
        self.assertEqual(cleaned.count("Пользователь:"), 1)
        self.assertEqual(stats["duplicate_standalone_documents_removed"], 1)


if __name__ == "__main__":
    unittest.main()
