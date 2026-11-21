import unittest

from qq_quantum.dialogue import build_conversation_prompt


class ConversationPromptTests(unittest.TestCase):
    def test_single_user_message_uses_trained_dialogue_format(self):
        prompt = build_conversation_prompt([
            {"role": "user", "content": "Привет, как тебя зовут?"},
        ])
        expected = chr(10).join([
            "Ты QQ Quantum — экспериментальная языковая модель. Отвечай по-русски, учитывай контекст, объясняй ясно и не выдумывай факты.",
            "Пользователь: Привет, как тебя зовут?",
            "QQ Quantum:",
        ])
        self.assertEqual(prompt, expected)

    def test_recent_assistant_and_user_turns_are_preserved_in_order(self):
        prompt = build_conversation_prompt([
            {"role": "system", "content": "Do not include this"},
            {"role": "user", "content": "Расскажи про космос."},
            {"role": "assistant", "content": "Космос — огромное пространство."},
            {"role": "user", "content": "А что такое галактика?"},
        ])
        self.assertTrue(prompt.startswith("Диалог 1. Продолжай разговор, учитывая предыдущие сообщения."))
        self.assertIn("Пользователь: Расскажи про космос.", prompt)
        self.assertIn("QQ Quantum: Космос — огромное пространство.", prompt)
        self.assertTrue(prompt.endswith(chr(10).join(["Пользователь: А что такое галактика?", "QQ Quantum:"])))
        self.assertNotIn("Do not include this", prompt)

    def test_limits_history_to_last_six_messages_and_sanitizes_role_content(self):
        messages = []
        for index in range(4):
            messages.extend([
                {"role": "user", "content": f"Вопрос {index}"},
                {"role": "assistant", "content": f"Ответ {index}"},
            ])
        messages.append({"role": "user", "content": "Новый вопрос"})
        prompt = build_conversation_prompt(messages)
        self.assertNotIn("Вопрос 0", prompt)
        self.assertIn("Вопрос 2", prompt)
        self.assertIn("Ответ 3", prompt)
        self.assertLessEqual(len(prompt), 6000)

    def test_respects_model_token_context_limit(self):
        class CharacterTokenizer:
            def encode(self, text, add_bos=False):
                return list(text) + (["BOS"] if add_bos else [])

        messages = [
            {"role": "user", "content": "Очень длинный вопрос " * 40},
            {"role": "assistant", "content": "Длинный ответ " * 40},
            {"role": "user", "content": "Что главное?"},
        ]
        prompt = build_conversation_prompt(messages, tokenizer=CharacterTokenizer(), max_tokens=150)
        self.assertLessEqual(len(prompt) + 1, 150)
        self.assertTrue(prompt.endswith(chr(10).join(["Пользователь: Что главное?", "QQ Quantum:"])))

    def test_ignores_empty_and_unknown_messages(self):
        prompt = build_conversation_prompt([
            {"role": "user", "content": "  "},
            {"role": "tool", "content": "internal data"},
            {"role": "user", "content": "Проверка"},
        ])
        self.assertIn("Пользователь: Проверка", prompt)
        self.assertNotIn("internal data", prompt)


if __name__ == "__main__":
    unittest.main()
