import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(
  new URL("../../../../", import.meta.url),
);

async function readRepository(path: string): Promise<string> {
  return readFile(`${repositoryRoot}${path}`, "utf8");
}

describe("UX V2 Wave E — Navigation evidence harness", () => {
  it("anchors active Navigation to the canonical UX V2 reference and 390px runtime capture", async () => {
    const [matrix, workflow] = await Promise.all([
      readRepository(
        "tests/visual-regression/ux-v2-manual-reference-matrix.json",
      ),
      readRepository(".github/workflows/navigation-visual-baseline.yml"),
    ]);

    expect(matrix).toContain('"navigation"');
    expect(matrix).toContain('"state": "active-navigation"');
    expect(matrix).toContain(
      '"expectedDominantRegion": "map + navigation instruction"',
    );
    expect(workflow).toContain("['mobile-390', 390, 844]");
    expect(workflow).toContain("mobile-390");
    expect(workflow).toContain("-active.png");
  });

  it("keeps this wave on the existing same-origin routing authority", async () => {
    const routing = await readRepository("packages/navigation/src/routing.ts");

    expect(routing).toContain(
      'const ROUTING_ENDPOINT = "/api/routing/directions"',
    );
    expect(routing).toContain('"foot-walking"');
    expect(routing).not.toContain("api_key=");
  });
});
