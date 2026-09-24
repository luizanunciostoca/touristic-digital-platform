import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const [manifestPath, outPath] = process.argv.slice(2);
if (!manifestPath || !outPath) {
  throw new Error(
    "usage: node tooling/fabric/build-proof-bundle.mjs <manifest> <out>",
  );
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const treeSha = execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
  encoding: "utf8",
}).trim();
const filesRaw = execFileSync(
  "git",
  ["diff", "--name-only", `${manifest.baseSha}...HEAD`],
  { encoding: "utf8" },
).trim();
const changedFiles = filesRaw ? filesRaw.split("\n") : [];

const bundle = {
  schema: 1,
  changeSetId: manifest.id,
  baseSha: manifest.baseSha,
  headSha,
  treeSha,
  risk: manifest.risk,
  changedFiles,
  requiredEvidence: manifest.requiredEvidence,
  generatedAt: new Date().toISOString(),
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(bundle, null, 2) + "\n");
console.log(JSON.stringify(bundle));
