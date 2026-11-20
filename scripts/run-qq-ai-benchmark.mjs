import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import {
  buildChatCompletionPayload,
  modelEndpointRequiresApiKey,
  resolveModelApiKey,
  safeModelEndpoint,
} from "../src/lib/model-gateway.ts";

const datasetPath = new URL("../evals/qq-ai-benchmark.ru.json", import.meta.url);
const dataset = JSON.parse(await readFile(datasetPath, "utf8"));
const endpoint = process.env.QQ_AI_API_URL?.trim();
const model = process.env.QQ_AI_MODEL?.trim();
const token = resolveModelApiKey(process.env.QQ_AI_API_KEY, process.env.OPENAIAPIKEY);

if (!endpoint || !model) {
  console.error("Set QQ_AI_API_URL and QQ_AI_MODEL in the environment. No key is required for a public endpoint; private endpoints may use QQ_AI_API_KEY.");
  process.exit(2);
}
const safeEndpoint = safeModelEndpoint(endpoint);
if (!safeEndpoint) {
  console.error("QQ_AI_API_URL must be a public HTTPS URL without embedded credentials.");
  process.exit(2);
}
if (modelEndpointRequiresApiKey(safeEndpoint) && !token) {
  console.error("The OpenAI API endpoint requires QQ_AI_API_KEY or OPENAIAPIKEY on the server.");
  process.exit(2);
}
const parsed = new URL(safeEndpoint);

const selected = dataset.cases.filter(item => !item.requiresMedia);
const results = [];
for (const item of selected) {
  const started = performance.now();
  try {
    const response = await fetch(safeEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: JSON.stringify(buildChatCompletionPayload({
        endpoint: safeEndpoint,
        model,
        temperature: 0.2,
        maxOutputTokens: 1200,
        stream: false,
        messages: [
          { role: "system", content: "Ты QQ AI. Отвечай по-русски. Будь точным, не выдумывай факты и показывай необходимые шаги." },
          { role: "user", content: item.prompt },
        ],
      })),
      signal: AbortSignal.timeout(60000),
    });
    const raw = await response.text();
    if (!response.ok) throw new Error("HTTP " + response.status + ": " + raw.slice(0, 300));
    const payload = JSON.parse(raw);
    const answer = payload.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) throw new Error("Empty or unsupported response format.");
    results.push({
      id: item.id,
      category: item.category,
      prompt: item.prompt,
      reference: item.reference ?? null,
      rubric: item.rubric,
      status: "completed",
      latencyMs: Math.round(performance.now() - started),
      answer,
    });
    process.stderr.write("✓ " + item.id + "\n");
  } catch (error) {
    results.push({
      id: item.id,
      category: item.category,
      prompt: item.prompt,
      reference: item.reference ?? null,
      rubric: item.rubric,
      status: "failed",
      latencyMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : "Unknown error",
    });
    process.stderr.write("✗ " + item.id + "\n");
  }
}

const report = {
  schemaVersion: 1,
  model,
  endpointHost: parsed.host,
  startedAt: new Date().toISOString(),
  completed: results.filter(item => item.status === "completed").length,
  failed: results.filter(item => item.status === "failed").length,
  note: "This runner does not assign quality scores. Evaluate outputs against each rubric and reference independently.",
  results,
};
const outputPath = process.env.QQ_AI_BENCHMARK_OUTPUT;
if (outputPath) {
  await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log("Benchmark report saved to " + outputPath);
} else {
  console.log(JSON.stringify(report, null, 2));
}
