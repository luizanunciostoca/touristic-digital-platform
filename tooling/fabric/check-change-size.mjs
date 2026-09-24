import { execFileSync } from "node:child_process";

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
  throw new Error(
    "ChangeSet exceeds hard size limit; split it or document an explicit generated/mechanical exception",
  );
}
