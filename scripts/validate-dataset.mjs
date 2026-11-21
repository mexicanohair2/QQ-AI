import { readFileSync } from "node:fs";
const file = new URL("../training/data/seed.jsonl", import.meta.url);
const lines = readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
const seen = new Set();
let errors = 0;
for (let i = 0; i < lines.length; i++) {
  try {
    const row = JSON.parse(lines[i]);
    if (!Array.isArray(row.messages) || row.messages.length < 2) throw new Error("messages must contain at least two turns");
    if (row.messages[0].role !== "user" || row.messages.at(-1).role !== "assistant") throw new Error("expected user then assistant");
    if (row.messages.some((m: any) => !["user", "assistant"].includes(m.role) || typeof m.content !== "string" || !m.content.trim())) throw new Error("invalid message");
    const key = row.messages.map((m: any) => m.content.trim().toLowerCase()).join("|");
    if (seen.has(key)) throw new Error("duplicate sample");
    seen.add(key);
  } catch (error) { errors++; console.error("Line " + (i + 1) + ": " + (error as Error).message); }
}
console.log("Validated " + lines.length + " examples; " + errors + " errors.");
if (errors) process.exitCode = 1;
