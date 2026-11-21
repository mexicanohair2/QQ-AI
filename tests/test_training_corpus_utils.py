import unittest

from training.corpus_utils import deduplicate_standalone_qa_documents


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
