import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(`${repositoryRoot}${path}`, "utf8");
}

describe("deterministic legacy CSS bundle contract", () => {
  it("generates one runtime legacy bundle from the frozen checkpoint order", async () => {
    const tooling = await readRepository(
      "apps/morro-digital-platform/tooling/build-legacy-css.mjs",
    );

    expect(tooling).toContain("const LEGACY_SOURCES = Object.freeze([");
    expect(tooling).toContain('resolve(legacyRoot, "checkpoint.css")');
    expect(tooling).toContain('resolve(legacyRoot, "index-inline.css")');
    expect(tooling).toContain('resolve(legacyRoot, "legacy.bundle.css")');
    expect(tooling).toContain("Legacy checkpoint order drifted");
    expect(tooling).toContain("Nested @import is not allowed");
    expect(tooling).toContain("GENERATED FILE — DO NOT EDIT");
  });

  it("loads the generated bundle instead of browser @import fan-out", async () => {
    const [html, worker, pkg] = await Promise.all([
      readRepository("apps/morro-digital-platform/public/index.html"),
      readRepository("apps/morro-digital-platform/public/service-worker.js"),
      readRepository("apps/morro-digital-platform/package.json"),
    ]);

    const bundle =
      "/apps/morro-digital-platform/public/legacy/legacy.bundle.css";
    expect(html).toContain(bundle);
    expect(html).not.toContain(
      "/apps/morro-digital-platform/public/legacy/checkpoint.css",
    );
    expect(html).not.toContain(
      "/apps/morro-digital-platform/public/legacy/index-inline.css",
    );
    expect(worker).toContain(bundle);
    expect(worker).not.toContain(
      "/apps/morro-digital-platform/public/legacy/checkpoint.css",
    );
    expect(pkg).toContain("node tooling/build-legacy-css.mjs");
  });

  it("keeps the immutable legacy checkpoint sources as generator inputs", async () => {
    const tooling = await readRepository(
      "apps/morro-digital-platform/tooling/build-legacy-css.mjs",
    );
    const snapshot = await readRepository(
      "apps/morro-digital-platform/src/legacy/v1-style-snapshot.test.ts",
    );

    expect(tooling).toContain("./css/base/variables.css");
    expect(tooling).toContain(
      "./css/components/navigation/navigation-banner.css",
    );
    expect(tooling).toContain(
      "./css/components/assistant/assistantModalUI.css",
    );
    expect(tooling).toContain("./css/components/tour/tour.css");
    expect(snapshot).toContain("preserves ${relativePath} byte for byte");
  });
});
