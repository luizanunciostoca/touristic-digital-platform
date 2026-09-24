import { execFileSync } from "node:child_process";

const [expectedMain, expectedHead] = process.argv.slice(2);
if (!expectedMain || !expectedHead)
  throw new Error("expected main and head SHAs are required");

const currentMain = execFileSync("git", ["rev-parse", "origin/main"], {
  encoding: "utf8",
}).trim();
const currentHead = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();

if (currentMain !== expectedMain)
  throw new Error(`main drift: expected ${expectedMain}, got ${currentMain}`);
if (currentHead !== expectedHead)
  throw new Error(`head drift: expected ${expectedHead}, got ${currentHead}`);

console.log(JSON.stringify({ currentMain, currentHead, valid: true }));
