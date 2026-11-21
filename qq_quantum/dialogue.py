"""Conversation formatting shared by QQ Quantum online inference and tests."""
from __future__ import annotations
from collections.abc import Mapping, Sequence
from typing import Any

SYSTEM_PREFIX = (
    "Ты QQ Quantum — экспериментальная языковая модель. "
    "Отвечай по-русски, учитывай контекст, объясняй ясно и не выдумывай факты."
)
DIALOGUE_PREFIX = "Диалог 1. Продолжай разговор, учитывая предыдущие сообщения."
_ROLE_LABELS = {"user": "Пользователь", "assistant": "QQ Quantum"}
_MAX_MESSAGES = 6
_MAX_MESSAGE_CHARS = 1_000
_MAX_PROMPT_CHARS = 6_000
_NEWLINE = chr(10)


def build_conversation_prompt(
    messages: Sequence[Mapping[str, object]],
    *,
    tokenizer: Any | None = None,
    max_tokens: int | None = None,
) -> str:
    """Format recent chat turns to match the single-turn and dialogue training templates."""
    if max_tokens is not None and (tokenizer is None or max_tokens < 2):
        raise ValueError("A tokenizer and max_tokens >= 2 are required together")

    turns: list[str] = []
    for message in messages:
        role = message.get("role")
        label = _ROLE_LABELS.get(role) if isinstance(role, str) else None
        content = message.get("content")
        if label is None or not isinstance(content, str):
            continue
        content = " ".join(content.replace("\x00", "").split())
        content = content.replace("Пользователь:", "Пользователь").replace("QQ Quantum:", "QQ Quantum")
        if not content:
            continue
        turns.append(f"{label}: {content[:_MAX_MESSAGE_CHARS]}")

    turns = turns[-_MAX_MESSAGES:]
    if turns and turns[-1].startswith("QQ Quantum:"):
        turns.pop()

    if not turns or not turns[-1].startswith("Пользователь:"):
        turns = ["Пользователь: Напиши вопрос."]

    is_dialogue = any(turn.startswith("QQ Quantum:") for turn in turns)
    prefix = (DIALOGUE_PREFIX if is_dialogue else SYSTEM_PREFIX) + _NEWLINE

    def render() -> str:
        return prefix + _NEWLINE.join(turns) + _NEWLINE + "QQ Quantum:"

    def fits(prompt: str) -> bool:
        if tokenizer is not None and max_tokens is not None:
            return len(tokenizer.encode(prompt, add_bos=True)) <= max_tokens
        return len(prompt) <= _MAX_PROMPT_CHARS

    while turns and not fits(render()):
        if len(turns) > 1:
            turns.pop(0)
            continue
        label, _, content = turns[0].partition(": ")
        if len(content) <= 24:
            break
        shortened = content[:max(24, int(len(content) * 0.7))]
        turns[0] = f"{label}: {shortened}"

    prompt = render()
    if not fits(prompt):
        raise ValueError("The current user message is too long for the model context")
    return prompt
