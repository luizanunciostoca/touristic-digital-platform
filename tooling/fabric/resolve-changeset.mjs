import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const branch = process.argv[2];
const optional = process.argv.includes("--optional");
if (!branch) throw new Error("branch is required");

const directory = ".morro/changesets";
const entries = (await readdir(directory)).filter(
  (name) => name.endsWith(".json") && name !== "schema.example.json",
);

for (const name of entries) {
  const path = join(directory, name);
  const manifest = JSON.parse(await readFile(path, "utf8"));
  if (manifest.branch === branch) {
    process.stdout.write(path);
    process.exit(0);
  }
}

if (!optional) throw new Error(`no ChangeSet manifest for branch: ${branch}`);
