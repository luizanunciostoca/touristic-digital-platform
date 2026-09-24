import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const directory = ".morro/changesets";
const entries = (await readdir(directory)).filter(
  (name) => name.endsWith(".json") && name !== "schema.example.json",
);
const manifests = [];

for (const name of entries) {
  manifests.push(JSON.parse(await readFile(join(directory, name), "utf8")));
}

const byId = new Map(manifests.map((manifest) => [manifest.id, manifest]));
const ready = [];
const blocked = [];

for (const manifest of manifests) {
  const unresolved = manifest.dependencies.filter((dependency) => {
    const item = byId.get(dependency);
    return (
      !item ||
      ![
        "MERGED",
        "POST_MERGE_PROVEN",
        "RELEASE_CANDIDATE",
        "STAGING_PROVEN",
        "CERTIFIED",
        "RELEASED",
        "PRODUCTION_VERIFIED",
      ].includes(item.state)
    );
  });

  const workerReady =
    manifest.state === "REMOTE_PROVEN" && unresolved.length === 0;

  if (workerReady) {
    ready.push({
      id: manifest.id,
      risk: manifest.risk,
      branch: manifest.branch,
    });
  } else {
    blocked.push({
      id: manifest.id,
      state: manifest.state,
      unresolved,
    });
  }
}

const riskWeight = { critical: 4, high: 3, medium: 2, low: 1 };
ready.sort(
  (a, b) => riskWeight[b.risk] - riskWeight[a.risk] || a.id.localeCompare(b.id),
);

console.log(JSON.stringify({ ready, blocked }, null, 2));
