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
    expect(packageJson).toContain("public/explore-locations.css");
    expect(packageJson).toContain("public/navigation-map.css");
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
    expect(config).toContain("premium-ux-v2.css");
    expect(config).toContain("assistant-v2.css");
    expect(config).toContain("tourist-shell-v2.css");
    expect(config).toContain("explore-locations.css");
    expect(config).toContain("navigation-map.css");
  });

  it("makes V2 tokens independent from legacy token aliases", async () => {
    const designSystem = await readRepository(
      "apps/morro-digital-platform/public/design-system-v2.css",
    );

    expect(designSystem).not.toContain("var(--primary,");
    expect(designSystem).not.toContain("var(--primary-dark,");
    expect(designSystem).not.toContain("var(--accent,");
    expect(designSystem).not.toContain("--font-sans,");
    expect(designSystem).toContain("--md-color-brand-primary: #3b82f6");
    expect(designSystem).toContain("--md-font-family-sans:");
  });

  it("loads V2 foundation before feature consumers", async () => {
    const index = await readRepository(
      "apps/morro-digital-platform/public/index.html",
    );
    const position = (needle: string) => {
      const value = index.indexOf(needle);
      expect(value).toBeGreaterThan(-1);
      return value;
    };

    const vendor = position("leaflet@1.9.4/dist/leaflet.css");
    const transitional = position("/public/styles.css");
    const frozenLegacy = position("/public/legacy/legacy.bundle.css");
    const foundation = position("/public/design-system-v2.css");
    const commerce = position("/public/commerce.css");
    const explore = position("/public/explore-locations.css");
    const assistant = position("/public/assistant-v2.css");
    const premium = position("/public/premium-ux-v2.css");
    const shell = position("/public/tourist-shell-v2.css");

    expect(vendor).toBeLessThan(transitional);
    expect(transitional).toBeLessThan(frozenLegacy);
    expect(frozenLegacy).toBeLessThan(foundation);
    expect(foundation).toBeLessThan(commerce);
    expect(foundation).toBeLessThan(explore);
    expect(foundation).toBeLessThan(assistant);
    expect(assistant).toBeLessThan(premium);
    expect(premium).toBeLessThan(shell);
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
