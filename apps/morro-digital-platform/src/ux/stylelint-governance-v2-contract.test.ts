import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(repositoryRoot + path, "utf8");
}

describe("Stylelint governance V2 contract", () => {
  it("pins Stylelint and runs it in the Quality Gate", async () => {
    const [packageJson, workflow] = await Promise.all([
      readRepository("package.json"),
      readRepository(".github/workflows/quality.yml"),
    ]);

    expect(packageJson).toContain("css:stylelint");
    expect(packageJson).toContain("stylelint@17.15.0");
    expect(packageJson).toContain("pnpm css:stylelint");
    expect(workflow).toContain("Enforce Stylelint V2 CSS governance");
    expect(workflow).toContain("run: pnpm css:stylelint");
  });

  it("protects migrated CSS from high-risk declarations", async () => {
    const config = await readRepository("stylelint.config.mjs");

    expect(config).toContain('"declaration-no-important": true');
    expect(config).toContain('"color-no-hex": true');
    expect(config).toContain('"declaration-property-value-disallowed-list"');
    expect(config).toContain('transition: ["/\\\\ball\\\\b/"]');
    expect(config).toContain('"z-index": ["/^-?\\\\d{3,}$/"]');
    expect(config).toContain('"declaration-property-unit-disallowed-list"');
    expect(config).toContain('"font-family"');
    expect(config).toContain("--md-font-family-sans");
  });

  it("keeps legacy and transitional bridges on an explicit allowlist", async () => {
    const ignore = await readRepository(".stylelintignore");

    expect(ignore).toContain("public/legacy/**");
    expect(ignore).toContain("public/styles.css");
    expect(ignore).not.toContain("public/explore-locations.css");
    expect(ignore).not.toContain("public/navigation-map.css");
    expect(ignore).toContain("public/v1-*.css");
  });
});
