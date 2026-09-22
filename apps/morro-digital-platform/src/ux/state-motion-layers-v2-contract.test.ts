import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(`${repositoryRoot}${path}`, "utf8");
}

describe("UX Design V2 semantic state, motion and layer authority", () => {
  it("centralizes runtime stacking values behind semantic layer tokens", async () => {
    const [tokens, explore, navigation] = await Promise.all([
      readRepository("apps/morro-digital-platform/public/design-system-v2.css"),
      readRepository(
        "apps/morro-digital-platform/public/explore-locations.css",
      ),
      readRepository("apps/morro-digital-platform/public/navigation-map.css"),
    ]);

    for (const token of [
      "--md-layer-explore-marker",
      "--md-layer-explore-controls",
      "--md-layer-explore-submenu",
      "--md-layer-navigation-user",
    ]) {
      expect(tokens).toContain(token);
    }
    expect(explore).toContain("var(--md-layer-explore-controls)");
    expect(explore).toContain("var(--md-layer-explore-submenu)");
    expect(explore).toContain("var(--md-layer-explore-marker)");
    expect(navigation).toContain("var(--md-layer-navigation-user)");
    expect(explore).not.toMatch(/z-index:\s*(?:1100|2050|2150)\b/u);
    expect(navigation).not.toMatch(/z-index:\s*9999\b/u);
  });

  it("uses semantic motion and shared interactive-state tokens", async () => {
    const [tokens, navigation, premium] = await Promise.all([
      readRepository("apps/morro-digital-platform/public/design-system-v2.css"),
      readRepository("apps/morro-digital-platform/public/navigation-map.css"),
      readRepository("apps/morro-digital-platform/public/premium-ux-v2.css"),
    ]);

    expect(tokens).toContain("--md-motion-duration-map-marker");
    expect(tokens).toContain("--md-motion-duration-pulse");
    expect(tokens).toContain("--md-motion-scale-pressed");
    expect(tokens).toContain("--md-state-disabled-opacity");
    expect(tokens).toContain('[aria-invalid="true"]');
    expect(tokens).toContain('[aria-selected="true"]');
    expect(navigation).toContain("var(--md-motion-duration-map-marker)");
    expect(navigation).toContain("var(--md-motion-duration-pulse)");
    expect(premium).toContain("var(--md-motion-scale-pressed)");
    expect(premium).toContain("var(--md-motion-scale-pressed-strong)");
  });

  it("makes tourist typography authoritative through the shared font token", async () => {
    const [premium, explore, commerce, ticketing] = await Promise.all([
      readRepository("apps/morro-digital-platform/public/premium-ux-v2.css"),
      readRepository(
        "apps/morro-digital-platform/public/explore-locations.css",
      ),
      readRepository("apps/morro-digital-platform/public/commerce.css"),
      readRepository("apps/morro-digital-platform/public/ticketing.css"),
    ]);

    expect(premium).toContain(
      "body[data-md-mode] {\n  font-family: var(--md-font-family-sans);",
    );
    expect(explore).toContain("font-family: var(--md-font-family-sans)");
    expect(commerce).toContain("font-family: var(--md-font-family-sans)");
    expect(ticketing).toContain("font-family: var(--md-font-family-sans)");
  });

  it("expands Stylelint governance to migrated Explore and Navigation CSS", async () => {
    const config = await readRepository("stylelint.config.mjs");

    const ignoreList = config.slice(0, config.indexOf("  rules:"));

    expect(ignoreList).not.toContain("**/public/explore-locations.css");
    expect(ignoreList).not.toContain("**/public/navigation-map.css");
    expect(config).toContain("**/public/explore-locations.css");
    expect(config).toContain("**/public/navigation-map.css");
    expect(config).toContain('"declaration-property-value-disallowed-list"');
    expect(config).toContain("transition:");
    expect(config).toContain('"z-index":');
  });
});
