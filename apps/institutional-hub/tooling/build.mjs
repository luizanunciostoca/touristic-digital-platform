import { mkdir, rm, copyFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { pages } from "../src/content.mjs";
import { renderPage } from "../src/render.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const repoRoot = resolve(appRoot, "../..");
const dist = resolve(appRoot, "dist");
const brandAssets = resolve(
  repoRoot,
  "packages/design-system/src/brand/v2/assets",
);

await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, "assets"), { recursive: true });

await copyFile(resolve(appRoot, "src/styles.css"), resolve(dist, "styles.css"));

const assets = [
  "tdp-symbol.svg",
  "tdp-micro.svg",
  "morro-symbol.svg",
  "itacare-symbol.svg",
];

for (const asset of assets) {
  await copyFile(resolve(brandAssets, asset), resolve(dist, "assets", asset));
}

for (const page of pages) {
  const routeDirectory =
    page.path === "/" ? dist : resolve(dist, page.path.slice(1));
  await mkdir(routeDirectory, { recursive: true });
  await writeFile(resolve(routeDirectory, "index.html"), renderPage(page), "utf8");
}

await writeFile(
  resolve(dist, "robots.txt"),
  "User-agent: *\nDisallow: /\n",
  "utf8",
);

await writeFile(
  resolve(dist, "build-manifest.json"),
  JSON.stringify(
    {
      app: "@touristic/institutional-hub",
      mode: "preview-non-production",
      language: "pt-BR",
      routes: pages.map((page) => page.path),
      indexing: false,
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

console.log(
  "Institutional Hub built: " +
    pages.length +
    " routes -> " +
    dist,
);
