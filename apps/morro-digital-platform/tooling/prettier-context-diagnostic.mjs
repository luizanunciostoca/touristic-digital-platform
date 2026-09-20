import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { format } from "prettier";

const repositoryRoot = resolve(process.cwd(), "../..");
const targets = [
  ".github/workflows/commerce-browser-regression.yml",
  "apps/morro-digital-platform/src/browser-entry.ts",
  "apps/morro-digital-platform/src/map/explore-locations-control.ts",
  "apps/morro-digital-platform/src/map/explore-location-identity.test.ts",
  "apps/morro-digital-platform/src/ux/tourist-experience-snapshot.ts",
  "apps/morro-digital-platform/src/ux/tourist-experience-snapshot.test.ts",
];

for (const path of targets) {
  const source = await readFile(resolve(repositoryRoot, path), "utf8");
  const formatted = await format(source, { filepath: path });
  process.stdout.write(
    "PRETTIER_CONTEXT_BEGIN:" +
      path +
      ":" +
      Buffer.from(formatted).toString("base64") +
      ":PRETTIER_CONTEXT_END\n",
  );
}
