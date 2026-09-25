import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const base = process.argv[2];
if (!base) throw new Error("base SHA required");

const numstat = execFileSync("git", ["diff", "--numstat", `${base}...HEAD`], {
  encoding: "utf8",
}).trim();
const rows = numstat ? numstat.split("\n") : [];
let additions = 0;
let deletions = 0;
for (const row of rows) {
  const [a, d] = row.split("\t");
  if (/^\d+$/u.test(a)) additions += Number(a);
  if (/^\d+$/u.test(d)) deletions += Number(d);
}
const files = rows.length;
const lines = additions + deletions;
const softExceeded = files > 15 || lines > 800;
const hardExceeded = files > 30 || lines > 1500;

console.log(
  JSON.stringify({
    files,
    additions,
    deletions,
    lines,
    softExceeded,
    hardExceeded,
  }),
);
if (hardExceeded) {
  const activeBranch =
    process.env.GITHUB_HEAD_REF?.trim() ||
    process.env.GITHUB_REF_NAME?.trim() ||
    "";
  const directory = ".morro/changesets";
  const manifests = readdirSync(directory)
    .filter((name) => name.endsWith(".json") && name !== "schema.example.json")
    .map((name) => JSON.parse(readFileSync(join(directory, name), "utf8")));
  const exception = manifests.find(
    (manifest) =>
      manifest?.branch === activeBranch &&
      manifest?.baseSha === base &&
      manifest?.risk === "critical" &&
      manifest?.stopAt === "REMOTE_PROVEN" &&
      manifest?.sizeException?.kind === "mechanical-composition",
  );
  const sourcePullRequests = exception?.sizeException?.sourcePullRequests;
  const maxFiles = Number(exception?.sizeException?.maxFiles);
  const maxLines = Number(exception?.sizeException?.maxLines);
  const reason = String(exception?.sizeException?.reason || "").trim();
  const validException =
    Boolean(exception) &&
    Array.isArray(sourcePullRequests) &&
    sourcePullRequests.length >= 2 &&
    sourcePullRequests.every(
      (value) => Number.isSafeInteger(value) && value > 0,
    ) &&
    Number.isSafeInteger(maxFiles) &&
    Number.isSafeInteger(maxLines) &&
    maxFiles >= files &&
    maxLines >= lines &&
    reason.length >= 80;

  if (!validException) {
    throw new Error(
      "ChangeSet exceeds hard size limit; split it or document an explicit generated/mechanical exception",
    );
  }

  console.log(
    JSON.stringify({
      sizeException: "accepted",
      id: exception.id,
      branch: activeBranch,
      baseSha: base,
      sourcePullRequests,
      reason,
    }),
  );
}
