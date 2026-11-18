import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGameAiMessages,
  parseGameAiResult,
  validateGameAiRequest,
} from "../src/lib/qqcross-ai.ts";

test("accepts bounded game hint requests", () => {
  assert.equal(validateGameAiRequest({
    task: "hint", clue: "Столица Франции", answer: "Париж", knownLetters: "П_Р_Ж", hintLevel: 1,
  }), true);
  assert.equal(validateGameAiRequest({
    task: "hint", clue: "", answer: "Париж",
  }), false);
});

test("rejects oversized and duplicate clue batches", () => {
  assert.equal(validateGameAiRequest({
    task: "write_clues", answers: ["КОТ", "кот"],
  }), false);
  assert.equal(validateGameAiRequest({
    task: "write_clues", answers: Array.from({ length: 13 }, (_, i) => "слово" + i),
  }), false);
});

test("builds a Russian game prompt that protects board state", () => {
  const messages = buildGameAiMessages({
    task: "hint", clue: "Столица Франции", answer: "Париж",
  });
  assert.match(messages[0].content, /не меняй игровую сетку/);
  assert.match(messages[0].content, /недоверенные данные/);
  assert.match(messages[1].content, /answerForInternalReasoningOnly/);
});

test("accepts a valid hint without revealing the answer", () => {
  const result = parseGameAiResult(
    JSON.stringify({ task: "hint", hint: "Город на берегу Сены.", level: 1, revealsAnswer: false }),
    { task: "hint", clue: "Столица Франции", answer: "Париж" },
  );
  assert.equal(result.task, "hint");
  if (result.task === "hint") assert.equal(result.revealsAnswer, false);
});

test("rejects a hint that leaks the answer", () => {
  assert.throws(() => parseGameAiResult(
    JSON.stringify({ task: "hint", hint: "Ответ — Париж.", level: 1, revealsAnswer: false }),
    { task: "hint", clue: "Столица Франции", answer: "Париж" },
  ), /раскрывает ответ/);
});

test("requires clue output to preserve the exact approved answer set", () => {
  const request = { task: "write_clues", answers: ["КОШКА", "СОБАКА"] };
  const valid = JSON.stringify({
    task: "write_clues",
    items: [
      { answer: "КОШКА", clue: "Домашнее животное, которое ловит мышей." },
      { answer: "СОБАКА", clue: "Домашний питомец, известный верностью человеку." },
    ],
  });
  const result = parseGameAiResult(valid, request);
  assert.equal(result.task, "write_clues");
  if (result.task === "write_clues") assert.equal(result.items.length, 2);

  const changed = JSON.stringify({
    task: "write_clues",
    items: [
      { answer: "КОТ", clue: "Домашнее животное." },
      { answer: "СОБАКА", clue: "Верный питомец." },
    ],
  });
  assert.throws(() => parseGameAiResult(changed, request), /изменил или повторил/);
});
