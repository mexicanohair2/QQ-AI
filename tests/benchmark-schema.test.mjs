import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const dataset = JSON.parse(await readFile(new URL("../evals/qq-ai-benchmark.ru.json", import.meta.url), "utf8"));

test("Russian QQ AI benchmark has unique cases and complete rubrics", () => {
  assert.equal(dataset.schemaVersion, 1);
  assert.equal(dataset.language, "ru");
  assert.ok(dataset.cases.length >= 20);
  const ids = dataset.cases.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const item of dataset.cases) {
    assert.ok(item.id && item.category && item.prompt);
    assert.ok(Array.isArray(item.rubric) && item.rubric.length >= 2);
    assert.ok(item.rubric.every(line => typeof line === "string" && line.length > 10));
  }
});

test("benchmark covers reasoning, math, search, vision, video and safety", () => {
  const categories = new Set(dataset.cases.map(item => item.category));
  for (const category of ["Russian reasoning", "Math", "Web research", "Vision / OCR", "Video frames", "Prompt injection"]) {
    assert.ok(categories.has(category), "Missing " + category);
  }
  assert.ok(dataset.cases.some(item => item.requiresMedia && item.category.startsWith("Vision")));
  assert.ok(dataset.cases.some(item => item.requiresMedia && item.category.startsWith("Video")));
});

test("benchmark runner excludes media-only tasks instead of pretending to test vision", async () => {
  const runner = await readFile(new URL("../scripts/run-qq-ai-benchmark.mjs", import.meta.url), "utf8");
  assert.match(runner, /filter\(item => !item\.requiresMedia\)/);
  assert.match(runner, /does not assign quality scores/);
  assert.doesNotMatch(runner, /console\.log\(token/);
});
