import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const [manifestPath, expectedMain, expectedHead] = process.argv.slice(2);
if (!manifestPath || !expectedMain || !expectedHead) {
  throw new Error(
    "usage: node tooling/fabric/check-merge-ready.mjs <manifest> <main-sha> <head-sha>",
  );
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.state !== "MERGE_READY") {
  throw new Error(`auto-merge forbidden in state ${manifest.state}`);
}

const currentHead = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const currentMain = execFileSync("git", ["rev-parse", "origin/main"], {
  encoding: "utf8",
}).trim();

if (currentHead !== expectedHead) throw new Error("expected HEAD changed");
if (currentMain !== expectedMain) throw new Error("main changed");

console.log(
  JSON.stringify({
    changeSetId: manifest.id,
    currentMain,
    currentHead,
    mergeReady: true,
  }),
);
