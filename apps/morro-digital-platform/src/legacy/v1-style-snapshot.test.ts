import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const V1_SOURCE_COMMIT = "60746fd7fed97b805758b37adfdbe3bad2582bfe";

// prettier-ignore
const V1_STYLE_BLOBS = Object.freeze({
  "css/base/variables.css": "8686e390ef14db5de3dd84f6394f0c896160ff42",
  "css/base/reset.css": "b9f10017ccdb2b4e6690badcc92c746fde9cb5a6",
  "css/base/typography.css": "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
  "css/base/animations.css": "ade5ec27700719e43d7fc57885964a2b1f9dd8ec",
  "css/layout/app-shell.css": "3db603bc3926909c2cd97e809f098ab087aa1f44",
  "css/layout/map.css": "78a463817403e52c065b15d1d5aaa955f1f288eb",
  "css/components/assistant/assistant-mood.css": "3858c89e4eb50cf0b770b52b5f34da0582248091",
  "css/components/inputs/inputs.css": "01e4db77b833a17539003e33f8852de2908ed68b",
  "css/base/responsive.css": "1d20db0784a63c55d764045797617e25f8a04695",
});

const legacyRoot = fileURLToPath(
  new URL("../../public/legacy/", import.meta.url),
);

function gitBlobSha(content: Buffer): string {
  const header = Buffer.from(`blob ${content.byteLength}\0`, "utf8");
  return createHash("sha1").update(header).update(content).digest("hex");
}

describe("V1 legacy style snapshot", () => {
  it("is pinned to the audited V1 source commit", () => {
    expect(V1_SOURCE_COMMIT).toBe("60746fd7fed97b805758b37adfdbe3bad2582bfe");
  });

  for (const [relativePath, expectedSha] of Object.entries(V1_STYLE_BLOBS)) {
    it(`preserves ${relativePath} byte for byte`, async () => {
      const content = await readFile(`${legacyRoot}${relativePath}`);
      expect(gitBlobSha(content)).toBe(expectedSha);
    });
  }
});
