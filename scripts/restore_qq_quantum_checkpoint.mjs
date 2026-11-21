import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const parts = ["00", "01", "02"].map(suffix => resolve(root, `training-artifacts/qq-quantum-v6-sft-best.pt.part-${suffix}`));
const output = resolve(root, "qq_quantum/artifacts/model-dialogue-v6-sft-best/latest.pt");
const expectedSize = 6_573_149;
const expectedSha256 = "7ca5091b022d8eda954af4a6a7169e6dd6fac544676ad00691801492b54587fd";

const chunks = await Promise.all(parts.map(path => readFile(path)));
const checkpoint = Buffer.concat(chunks);
const sha256 = createHash("sha256").update(checkpoint).digest("hex");
if (checkpoint.length !== expectedSize || sha256 !== expectedSha256) {
  throw new Error(`Checkpoint verification failed: size=${checkpoint.length}, sha256=${sha256}`);
}
await mkdir(dirname(output), { recursive: true });
await writeFile(output, checkpoint);
console.log(`Restored and verified QQ Quantum research checkpoint (${checkpoint.length} bytes, step-25 best).`);
