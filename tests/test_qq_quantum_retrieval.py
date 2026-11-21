import unittest

from qq_quantum.retrieval import find_answer, load_qa


class RetrievalTests(unittest.TestCase):
    def setUp(self):
        self.pairs = load_qa(chr(10).join([
            "Пользователь: Привет, как тебя зовут?",
            "QQ Quantum: Меня зовут QQ Quantum.",
            "Пользователь: Сколько будет 17 умножить на 23?",
            "QQ Quantum: 17 × 23 = 391.",
            "Пользователь: Что такое механизм внимания?",
            "QQ Quantum: Механизм внимания оценивает важность частей входной последовательности.",
            "Пользователь: Что такое галактика?",
            "QQ Quantum: Галактика — большая система звёзд, газа и пыли.",
        ]))

    def test_matches_exact_single_word_greeting_after_punctuation_normalization(self):
        pairs = load_qa(chr(10).join([
            "Пользователь: Привет!",
            "QQ Quantum: Привет! Чем займёмся?",
        ]))
        self.assertEqual(find_answer("ПРИВЕТ!!!", pairs), "Привет! Чем займёмся?")

    def test_matches_greeting_paraphrase(self):
        self.assertEqual(
            find_answer("Здравствуй! Как тебя зовут?", self.pairs),
            "Меня зовут QQ Quantum.",
        )

    def test_matches_math_question_with_extra_instruction(self):
        self.assertEqual(
            find_answer("Сколько получится, если 17 умножить на 23? Покажи расчёт.", self.pairs),
            "17 × 23 = 391.",
        )

    def test_matches_question_with_extra_context_words(self):
        self.assertEqual(
            find_answer("Объясни мне механизм внимания в нейросети простыми словами.", self.pairs),
            "Механизм внимания оценивает важность частей входной последовательности.",
        )

    def test_matches_russian_case_and_number_variants(self):
        expanded = load_qa(chr(10).join([
            "Пользователь: Что такое солнечная система?",
            "QQ Quantum: Солнечная система включает Солнце и небесные тела, связанные его гравитацией.",
        ]))
        self.assertEqual(
            find_answer("Расскажи о солнечной системе.", expanded),
            "Солнечная система включает Солнце и небесные тела, связанные его гравитацией.",
        )

    def test_unique_topic_terms_can_resolve_short_followups(self):
        self.assertEqual(
            find_answer("А что такое галактика?", self.pairs),
            "Галактика — большая система звёзд, газа и пыли.",
        )
        pairs = load_qa(chr(10).join([
            "Пользователь: Что такое энергия?",
            "QQ Quantum: Энергия характеризует способность системы совершать работу.",
            "",
            "Пользователь: Что такое цикл?",
            "QQ Quantum: Цикл повторяет набор инструкций.",
            "",
            "Пользователь: Что такое API?",
            "QQ Quantum: API задаёт правила взаимодействия программ.",
        ]))
        self.assertEqual(
            find_answer("Расскажи об энергии.", pairs),
            "Энергия характеризует способность системы совершать работу.",
        )
        self.assertEqual(find_answer("Объясни цикл простыми словами.", pairs),
                         "Цикл повторяет набор инструкций.")
        self.assertEqual(find_answer("Расскажи об API.", pairs),
                         "API задаёт правила взаимодействия программ.")

    def test_ambiguous_single_topic_term_is_rejected(self):
        pairs = load_qa(chr(10).join([
            "Пользователь: Что такое вода?",
            "QQ Quantum: Вода — химическое соединение.",
            "Пользователь: Почему вода важна?",
            "QQ Quantum: Вода важна для жизни.",
        ]))
        self.assertIsNone(find_answer("Вода?", pairs))

    def test_stemming_does_not_turn_single_shared_word_into_a_match(self):
        self.assertIsNone(find_answer("Можно приготовить галактику?", self.pairs))

    def test_rejects_match_based_on_only_one_shared_word(self):
        self.assertIsNone(find_answer("А чем галактика отличается от звёздной системы?", self.pairs))

    def test_rejects_unrelated_question(self):
        self.assertIsNone(find_answer("Как приготовить рис?", self.pairs))

    def test_deduplicates_conflicting_standalone_prompts_using_last_curated_answer(self):
        corpus = chr(10).join([
            "Пользователь: Что такое алгоритм?",
            "QQ Quantum: Старый краткий ответ.",
            "",
            "Ты QQ Quantum — экспериментальная модель.",
            "Пользователь: Что такое алгоритм?",
            "QQ Quantum: Новый подробный ответ.",
        ])
        pairs = load_qa(corpus)
        self.assertEqual(len(pairs), 1)
        self.assertEqual(find_answer("Что такое алгоритм?", pairs), "Новый подробный ответ.")

    def test_excludes_dialogue_only_answers_from_context_free_retrieval(self):
        corpus = chr(10).join([
            "Диалог 1. Продолжай разговор.",
            "Пользователь: Привет!",
            "QQ Quantum: Привет! Я уже знаю тему разговора.",
            "Пользователь: А почему?",
            "QQ Quantum: Потому что предыдущая реплика задаёт контекст.",
        ])
        self.assertEqual(load_qa(corpus), [])
        self.assertIsNone(find_answer("А почему?", load_qa(corpus)))

    def test_keeps_standalone_qa_and_excludes_multi_turn_duplicates(self):
        corpus = chr(10).join([
            "Ты QQ Quantum — экспериментальная модель.",
            "Пользователь: Что такое галактика?",
            "QQ Quantum: Самостоятельное объяснение галактики.",
            "",
            "Диалог 1. Продолжай разговор.",
            "Пользователь: Что такое галактика?",
            "QQ Quantum: Ответ, зависящий от предыдущих реплик.",
        ])
        pairs = load_qa(corpus)
        self.assertEqual(len(pairs), 1)
        self.assertEqual(
            find_answer("Что такое галактика?", pairs),
            "Самостоятельное объяснение галактики.",
        )


if __name__ == "__main__":
    unittest.main()
