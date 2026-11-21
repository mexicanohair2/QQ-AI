"""Conservative Russian lexical retrieval for authored QQ Quantum knowledge examples."""
from __future__ import annotations

import re

_STOP_WORDS = set("""
а без бы в во вот все вы где да для до его ее если есть же за и из или им их к как ко когда кто ли мне мы на над не него нее ни но о об от по под при про раз с со так то тоже у уже что чтобы это этот я чем такое такой такая такие таких этому этому этой этих этот
расскажи объясни скажи покажи назови опиши перечисли приведи представь коротко кратко просто простыми словами пожалуйста можешь можно нужно хочу узнать
""".split())
_WORD_RE = re.compile(r"[а-яёa-z0-9]+", re.I)
_RU_SUFFIXES = tuple(sorted({
    "иями", "ями", "ами", "его", "ого", "ему", "ому", "ыми", "ими",
    "ившись", "ывшись", "ившими", "ывшими",
    "аться", "яться", "иться", "ыться", "овать", "евать", "ивать", "ывать",
    "ии", "ией", "ием", "иях", "ению", "ание", "ение",
    "ая", "яя", "ое", "ее", "ые", "ие", "ый", "ий", "ой", "ей",
    "ую", "юю", "ым", "им", "ых", "их", "ом", "ем", "ам", "ям",
    "ах", "ях", "ов", "ев", "ия", "ья", "а", "я", "ы", "и", "е", "у", "ю",
}, key=len, reverse=True))


def normalize_question(text: str) -> str:
    """Normalize punctuation and case while retaining word order."""
    return " ".join(_WORD_RE.findall(text.casefold()))


def normalize_word(word: str) -> str:
    """Apply a conservative Russian inflection stem for case/number agreement."""
    value = word.casefold()
    if not re.fullmatch(r"[а-яё]+", value) or len(value) < 5:
        return value
    for suffix in _RU_SUFFIXES:
        if value.endswith(suffix) and len(value) - len(suffix) >= 3:
            return value[:-len(suffix)]
    return value


def terms(text: str) -> list[str]:
    return [
        normalize_word(word)
        for word in _WORD_RE.findall(text.casefold())
        if len(word) > 1 and word not in _STOP_WORDS
    ]


def load_qa(corpus: str) -> list[tuple[str, str, set[str]]]:
    """Index standalone Q&A documents only; conversational turns need their context.

    When the corpus contains repeated standalone prompts, the last curated answer
    wins. Multi-turn dialogue documents are deliberately excluded so an answer
    conditioned on earlier turns cannot be mistaken for a context-free FAQ answer.
    """
    canonical: dict[str, tuple[str, str, set[str]]] = {}
    for document in re.split(r"\n\s*\n", corpus):
        block = document.strip()
        if not block or block.startswith("Диалог "):
            continue

        question: str | None = None
        for raw_line in block.splitlines():
            line = raw_line.strip()
            if line.startswith("Пользователь:"):
                question = line[len("Пользователь:"):].strip()
            elif line.startswith("QQ Quantum:") and question:
                answer = line[len("QQ Quantum:"):].strip()
                key = normalize_question(question)
                question_terms = set(terms(question))
                if key and answer and question_terms:
                    canonical[key] = (question, answer, question_terms)
                question = None

    return list(canonical.values())


def find_answer(question: str, pairs: list[tuple[str, str, set[str]]]) -> str | None:
    """Return a stored answer only for an exact short query or multiple agreeing terms."""
    normalized_query = normalize_question(question)
    if normalized_query:
        for prompt, answer, _known_terms in pairs:
            if normalize_question(prompt) == normalized_query:
                return answer

    query = set(terms(question))
    if len(query) == 1:
        only_term = next(iter(query))
        raw_lower = question.casefold()
        has_definition_intent = any(
            marker in raw_lower
            for marker in ("что такое", "расскажи", "объясни", "дай определение", "определи")
        )
        if len(only_term) >= 3 and has_definition_intent:
            matching = [
                (answer, known_terms)
                for _prompt, answer, known_terms in pairs
                if only_term in known_terms
            ]
            direct_definitions = [
                answer for answer, known_terms in matching
                if known_terms == {only_term}
            ]
            if len(direct_definitions) == 1:
                return direct_definitions[0]
            if matching and len({answer for answer, _terms in matching}) == 1:
                return matching[0][0]
            if len(matching) == 1:
                return matching[0][0]
        return None
    if not query:
        return None

    best_answer: str | None = None
    best_score = 0.0
    for _prompt, answer, known_terms in pairs:
        overlap = len(query & known_terms)
        if overlap < 2:
            continue
        query_coverage = overlap / len(query)
        known_coverage = overlap / max(1, len(known_terms))
        if query_coverage < 0.30 or known_coverage < 0.55:
            continue
        score = 0.55 * query_coverage + 0.45 * known_coverage
        if score > best_score:
            best_answer, best_score = answer, score
    return best_answer
