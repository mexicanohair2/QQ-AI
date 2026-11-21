import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assetDirectory = resolve(root, "public/quantum");
const modelPath = resolve(assetDirectory, "model.json");
const manifestPath = resolve(assetDirectory, "manifest.json");
const sourceUrl = process.env.QQ_QUANTUM_ASSET_URL ||
  "https://sb-45hbpn4uh63g.vercel.run/model.json";

async function atomicWrite(path, content) {
  const temporary = path + ".tmp";
  await writeFile(temporary, content);
  await rename(temporary, path);
}

async function main() {
  await mkdir(assetDirectory, { recursive: true });
  const response = await fetch(sourceUrl, { cache: "no-store", redirect: "follow" });
  if (!response.ok) throw new Error(`QQ Quantum asset source returned HTTP ${response.status}`);
  const raw = Buffer.from(await response.arrayBuffer());
  if (raw.length < 1024 || raw.length > 8 * 1024 * 1024) {
    throw new Error(`QQ Quantum asset size is outside the expected range: ${raw.length}`);
  }
  const assets = JSON.parse(raw.toString("utf8"));
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
    throw new Error("QQ Quantum model weights failed the SHA-256 integrity check.");
  }
  const manifest = {
    format: "qq-quantum-web-manifest-v1",
    weights_sha256: metadata.weights_sha256,
    training_step: metadata.training_step,
    asset_path: "model.json",
  };
  await atomicWrite(modelPath, raw);
  await atomicWrite(manifestPath, JSON.stringify(manifest) + "\n");
  console.log(JSON.stringify({
    prepared: true,
    model: "public/quantum/model.json",
    bytes: raw.length,
    training_step: metadata.training_step,
    weights_sha256: actualHash,
    corpus_chars: assets.corpus.length,
  }, null, 2));
}

main().catch(error => {
  console.error("[qq-quantum-assets]", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
