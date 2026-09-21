import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(`${repositoryRoot}${path}`, "utf8");
}

describe("Design Tokens V2 canonical authority", () => {
  it("owns foundation and component tokens in design-system-v2.css", async () => {
    const css = await readRepository(
      "apps/morro-digital-platform/public/design-system-v2.css",
    );

    for (const token of [
      "--md-color-brand-primary",
      "--md-font-family-sans",
      "--md-space-4",
      "--md-radius-md",
      "--md-elevation-2",
      "--md-motion-duration-normal",
      "--md-layer-dialog",
      "--md-state-disabled-opacity",
      "--md-outdoor-surface",
      "--md-sheet-peek-height",
      "--md-navigation-surface",
    ]) {
      expect(css, `missing ${token}`).toContain(token);
    }
  });

  it("does not derive canonical brand or typography tokens from legacy aliases", async () => {
    const css = await readRepository(
      "apps/morro-digital-platform/public/design-system-v2.css",
    );

    expect(css).not.toContain("var(--primary,");
    expect(css).not.toContain("var(--primary-dark,");
    expect(css).not.toContain("var(--accent,");
    expect(css).not.toContain("var(--accent-dark,");
    expect(css).not.toContain("--font-sans,");
    expect(css).toContain("--md-color-brand-primary: #3b82f6;");
    expect(css).toContain("--md-destination-accent-morro: #10b981;");
  });

  it("does not duplicate global outdoor or sheet tokens in Premium UX", async () => {
    const css = await readRepository(
      "apps/morro-digital-platform/public/premium-ux-v2.css",
    );

    expect(css).not.toContain("--md-outdoor-surface:");
    expect(css).not.toContain("--md-outdoor-shadow:");
    expect(css).not.toContain("--md-sheet-peek-height:");
    expect(css).not.toContain("--md-sheet-half-height:");
    expect(css).not.toContain("--md-sheet-full-height:");
    expect(css).toContain("var(--md-outdoor-surface)");
    expect(css).toContain("var(--md-sheet-peek-height)");
  });

  it("keeps feature-local derived state variables separate from global tokens", async () => {
    const css = await readRepository(
      "apps/morro-digital-platform/public/premium-ux-v2.css",
    );

    expect(css).toContain("--md-active-mode:");
    expect(css).toContain("--md-navigation-primary-gradient:");
    expect(css).toContain("--md-map-ui-priority:");
  });
});
