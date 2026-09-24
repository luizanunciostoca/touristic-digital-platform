import { execFileSync } from "node:child_process";

const [base, ...refs] = process.argv.slice(2);
if (!base || refs.length === 0) {
  throw new Error(
    "usage: node tooling/fabric/build-shadow-main.mjs <base> <ref...>",
  );
}

let current = base;
const compositions = [];

for (const ref of refs) {
  const tree = execFileSync(
    "git",
    ["merge-tree", "--write-tree", current, ref],
    { encoding: "utf8" },
  ).trim();

  compositions.push({ base: current, ref, tree });
  current = tree;
}

console.log(
  JSON.stringify(
    {
      authoritativeForRelease: false,
      base,
      refs,
      compositions,
      finalTree: current,
    },
    null,
    2,
  ),
);
