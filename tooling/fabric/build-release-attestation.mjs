import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const [expectedSha, provenancePath, outputPath] = process.argv.slice(2);
if (!expectedSha || !provenancePath || !outputPath) {
  throw new Error(
    "usage: node tooling/fabric/build-release-attestation.mjs <sha> <provenance> <out>",
  );
}

const actualSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const treeSha = execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
  encoding: "utf8",
}).trim();
if (actualSha !== expectedSha)
  throw new Error("release attestation exact SHA mismatch");

const provenance = JSON.parse(await readFile(provenancePath, "utf8"));
if (provenance.sourceSha && provenance.sourceSha !== expectedSha) {
  throw new Error("provenance source SHA mismatch");
}
if (provenance.treeSha && provenance.treeSha !== treeSha) {
  throw new Error("provenance tree SHA mismatch");
}

const attestation = {
  schema: 1,
  sourceSha: expectedSha,
  treeSha,
  imageDigest: provenance.imageDigest ?? null,
  provenance,
  generatedAt: new Date().toISOString(),
};

await writeFile(outputPath, JSON.stringify(attestation, null, 2) + "\n");
console.log(JSON.stringify(attestation));
