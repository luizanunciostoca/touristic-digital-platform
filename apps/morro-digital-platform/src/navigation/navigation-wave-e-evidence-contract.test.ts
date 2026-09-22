import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(`${repositoryRoot}${path}`, "utf8");
}

describe("UX V2 Wave E navigation evidence", () => {
  it("pins the canonical 390px runtime evidence contract", async () => {
    const matrix = await readRepository(
      "tests/visual-regression/ux-v2-manual-reference-matrix.json",
    );
    const workflow = await readRepository(
      ".github/workflows/navigation-visual-baseline.yml",
    );

    expect(matrix).toContain('"state": "active-navigation"');
    expect(workflow).toContain("['mobile-390', 390, 844]");
    expect(workflow).toContain("-active.png");
  });

  it("keeps routing on the existing same-origin walking contract", async () => {
    const routing = await readRepository("packages/navigation/src/routing.ts");

    expect(routing).toContain(
      'const ROUTING_ENDPOINT = "/api/routing/directions"',
    );
    expect(routing).toContain('"foot-walking"');
    expect(routing).not.toContain("api_key=");
  });
});
