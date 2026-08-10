import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(process.cwd(), "../..");
const manifestPath = resolve(
  repositoryRoot,
  "docs/qa/ASSISTANT-V1-PHOTO-ASSETS.sha256",
);
const photosDirectory = resolve(repositoryRoot, "images/fotos");

interface FrozenAsset {
  readonly hash: string;
  readonly path: string;
}

async function readFrozenAssets(): Promise<readonly FrozenAsset[]> {
  const manifest = await readFile(manifestPath, "utf8");
  return manifest
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^([a-f0-9]{64})\s{2}(.+)$/u.exec(line);
      if (!match) throw new Error(`Invalid photo asset manifest line: ${line}`);
      return { hash: match[1], path: match[2] };
    });
}

describe("V1 physical photo assets", () => {
  it("preserves the exact audited file set and bytes", async () => {
    const assets = await readFrozenAssets();
    expect(assets).toHaveLength(63);

    const diskFiles = (await readdir(photosDirectory))
      .filter((name) => /\.jpe?g$/iu.test(name))
      .map((name) => `images/fotos/${name}`)
      .sort();
    expect(diskFiles).toEqual(assets.map((asset) => asset.path).sort());

    for (const asset of assets) {
      const bytes = await readFile(resolve(repositoryRoot, asset.path));
      const hash = createHash("sha256").update(bytes).digest("hex");
      expect(hash, asset.path).toBe(asset.hash);
    }
  });
});
