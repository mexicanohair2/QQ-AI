import subprocess
import sys
import unittest
from pathlib import Path

from qq_quantum.model.training import _read_corpus
from qq_quantum.retrieval import find_answer, load_qa, normalize_question


ROOT = Path(__file__).resolve().parents[1]
CORPUS_PATH = ROOT / "training" / "data" / "qq_quantum_dialogue_v2.txt"


class AuthoredCorpusRetrievalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not CORPUS_PATH.is_file():
            subprocess.run(
                [sys.executable, str(ROOT / "training" / "build_dialogue_corpus.py")],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
        cls.pairs = load_qa(_read_corpus(CORPUS_PATH))

    def test_standalone_index_has_no_duplicate_normalized_prompts(self):
        keys = [normalize_question(prompt) for prompt, _answer, _terms in self.pairs]
        self.assertEqual(len(keys), len(set(keys)))

    def test_every_indexed_exact_question_returns_its_canonical_answer(self):
        for prompt, answer, _terms in self.pairs:
            with self.subTest(prompt=prompt):
                self.assertEqual(find_answer(prompt, self.pairs), answer)

    def test_dialogue_only_turns_are_not_indexed_as_context_free_faqs(self):
        self.assertLess(len(self.pairs), 300)
        self.assertEqual(
            find_answer("А что такое галактика?", self.pairs),
            "Галактика — большая система из звёзд, газа, пыли и тёмной материи, связанных гравитацией.",
        )

    def test_short_common_topic_without_unique_answer_is_rejected(self):
        self.assertIsNone(find_answer("Вода?", self.pairs))

    def test_common_definition_paraphrases_retrieve_the_same_canonical_answer(self):
        probes = []
        for prompt, answer, _terms in self.pairs:
            if not prompt.startswith("Что такое "):
                continue
            topic = prompt[len("Что такое "):].rstrip("?.!")
            probes.append(("Объясни " + topic + " простыми словами.", answer))
            probes.append(("Расскажи, пожалуйста, что такое " + topic + ".", answer))
        self.assertGreaterEqual(len(probes), 200)
        for question, answer in probes:
            with self.subTest(question=question):
                self.assertEqual(find_answer(question, self.pairs), answer)

    def test_training_corpus_has_no_conflicting_standalone_qa_targets(self):
        from training.corpus_utils import deduplicate_standalone_qa_documents

        raw_corpus = _read_corpus(CORPUS_PATH)
        _cleaned, stats = deduplicate_standalone_qa_documents(raw_corpus)
        self.assertEqual(stats["duplicate_standalone_documents_removed"], 0)
        self.assertEqual(
            stats["standalone_documents_before"],
            stats["standalone_documents_after"],
        )


if __name__ == "__main__":
    unittest.main()
