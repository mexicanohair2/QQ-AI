import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const modelPath = resolve(root, "server/quantum/model.json");
const manifestPath = resolve(root, "server/quantum/manifest.json");
const sourceUrl = process.env.QQ_QUANTUM_MODEL_SOURCE_URL ||
  "https://qq-ai-preview-6pzezt4y1-mexicanohaie.vercel.app/quantum/model.json";
const maxBytes = 10 * 1024 * 1024;

async function downloadModel() {
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000), headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`QQ Quantum artifact download failed: HTTP ${response.status}`);
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize && (declaredSize < 1_000 || declaredSize > maxBytes)) {
    throw new Error(`QQ Quantum artifact has an invalid Content-Length: ${declaredSize}`);
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length < 1_000 || body.length > maxBytes) {
    throw new Error(`QQ Quantum artifact has an invalid size: ${body.length}`);
  }
  await mkdir(resolve(root, "server/quantum"), { recursive: true });
  await writeFile(modelPath, body);
  return body;
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.format !== "qq-quantum-web-manifest-v1" ||
      manifest.asset_path !== "model.json" ||
      !/^[a-f0-9]{64}$/.test(manifest.weights_sha256 || "")) {
    throw new Error("Committed QQ Quantum manifest is invalid.");
  }

  let raw = await readFile(modelPath).catch(() => null);
  let assets = null;
  if (raw) {
    try { assets = JSON.parse(raw.toString("utf8")); } catch { assets = null; }
  }
  if (assets?.metadata?.weights_sha256 !== manifest.weights_sha256) {
    raw = await downloadModel();
    assets = JSON.parse(raw.toString("utf8"));
  }

  const metadata = assets?.metadata;
  if (metadata?.format !== "qq-quantum-web-weights-v1" ||
      metadata?.checkpoint_format !== "qq-quantum-sft-v1" ||
      !Number.isInteger(metadata.training_step) ||
      !Number.isInteger(metadata.weight_bytes) ||
      metadata.weights_sha256 !== manifest.weights_sha256 ||
      metadata.training_step !== manifest.training_step ||
      typeof assets.corpus !== "string" ||
      assets.corpus.length < 100_000 ||
      typeof assets.weights_gzip_base64 !== "string" ||
      !assets.tokenizer) {
    throw new Error("QQ Quantum model package has an unsupported or incomplete format.");
  }

  const weights = gunzipSync(Buffer.from(assets.weights_gzip_base64, "base64"));
  const actualHash = createHash("sha256").update(weights).digest("hex");
  if (weights.length !== metadata.weight_bytes || actualHash !== metadata.weights_sha256) {
    throw new Error("QQ Quantum model weights failed size or SHA-256 verification.");
  }
  console.log(`Validated server-only QQ Quantum package: step ${metadata.training_step}, ${weights.length} weight bytes, SHA-256 ${actualHash}.`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
