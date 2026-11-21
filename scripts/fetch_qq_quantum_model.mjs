import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const modelPath = resolve(root, "server/quantum/model.json");
const manifestPath = resolve(root, "server/quantum/manifest.json");

async function main() {
  const [raw, manifestRaw] = await Promise.all([readFile(modelPath), readFile(manifestPath)]);
  const assets = JSON.parse(raw.toString("utf8"));
  const manifest = JSON.parse(manifestRaw.toString("utf8"));
  const metadata = assets?.metadata;
  if (metadata?.format !== "qq-quantum-web-weights-v1" ||
      metadata?.checkpoint_format !== "qq-quantum-sft-v1" ||
      !Number.isInteger(metadata.training_step) ||
      !Number.isInteger(metadata.weight_bytes) ||
      !/^[a-f0-9]{64}$/.test(metadata.weights_sha256 || "") ||
      typeof assets.corpus !== "string" ||
      typeof assets.weights_gzip_base64 !== "string") {
    throw new Error("QQ Quantum model package has an unsupported or incomplete format.");
  }
  const weights = gunzipSync(Buffer.from(assets.weights_gzip_base64, "base64"));
  const actualHash = createHash("sha256").update(weights).digest("hex");
  if (weights.length !== metadata.weight_bytes || actualHash !== metadata.weights_sha256) {
    throw new Error("QQ Quantum model weights failed size or SHA-256 verification.");
  }
  if (manifest.format !== "qq-quantum-web-manifest-v1" ||
      manifest.weights_sha256 !== actu¶»§q«^