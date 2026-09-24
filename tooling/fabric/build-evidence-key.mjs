import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const [bundlePath, inputsPath] = process.argv.slice(2);
if (!bundlePath) {
  throw new Error(
    "usage: node tooling/fabric/build-evidence-key.mjs <bundle> [inputs]",
  );
}

const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
const extraInputs = inputsPath
  ? JSON.parse(await readFile(inputsPath, "utf8"))
  : {};

const canonical = JSON.stringify({
  treeSha: bundle.treeSha,
  risk: bundle.risk,
  requiredEvidence: [...bundle.requiredEvidence].sort(),
  extraInputs,
});

const key = createHash("sha256").update(canonical).digest("hex");
console.log(key);
