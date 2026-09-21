import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(`${repositoryRoot}${path}`, "utf8");
}

describe("UX Design V2 device matrix contract", () => {
  it("covers every required canonical viewport plus relevant landscape orientations", async () => {
    const workflow = await readRepository(
      ".github/workflows/v1-home-responsive-browser-regression.yml",
    );

    for (const width of [
      320, 360, 375, 390, 393, 412, 430, 768, 820, 1024, 1280, 1366, 1440,
      1920,
    ]) {
      expect(workflow, `missing width ${width}`).toContain(
        `width: ${width}`,
      );
    }
    expect(workflow).toContain("mobile-landscape");
    expect(workflow).toContain("mobile-large-landscape");
    expect(workflow).toContain("tablet-landscape");
  });

  it("checks overflow, touch targets, dynamic viewport units and keyboard-like compaction", async () => {
    const workflow = await readRepository(
      ".github/workflows/v1-home-responsive-browser-regression.yml",
    );

    expect(workflow).toContain("Device matrix horizontal overflow");
    expect(workflow).toContain("Device matrix touch target below 44px");
    expect(workflow).toContain("CSS.supports('height', '100dvh')");
    expect(workflow).toContain("CSS.supports('height', '100svh')");
    expect(workflow).toContain("keyboardLikeViewport");
    expect(workflow).toContain("setViewportSize({ width: 390, height: 520 })");
  });
});
