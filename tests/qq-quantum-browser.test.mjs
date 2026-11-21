import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import {
  findQuantumKnowledgeAnswer,
  indexQuantumKnowledge,
  normalizeQuantumWord,
  buildQuantumPrompt,
} from "../src/lib/qq-quantum-dialogue.ts";

const root = new URL("../", import.meta.url);

test("website does not register a browser-side QQ Quantum model downloader", async () => {
  const config = await readFile(new URL("vite.config.ts", root), "utf8");
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  assert.doesNotMatch(config, /qqQuantumIntegration/);
  assert.doesNotMatch(app, /<button[^>]*>Офлайн<\/button>/);
  assert.doesNotMatch(app, /onClick=\{loadOfflineModel\}/);
  assert.doesNotMatch(app, /Открыть офлайн-режим/);
  assert.match(app, /QQ Quantum работает на сервере/);
});

test("server-side model package matches its manifest and has intact weights", async () => {
  const assets = JSON.parse(await readFile(new URL("server/quantum/model.json", root), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("server/quantum/manifest.json", root), "utf8"));
  assert.equal(manifest.format, "qq-quantum-web-manifest-v1");
  assert.equal(manifest.asset_path, "model.json");
  assert.equal(assets.metadata.format, "qq-quantum-web-weights-v1");
  assert.equal(assets.metadata.checkpoint_format, "qq-quan���q�^