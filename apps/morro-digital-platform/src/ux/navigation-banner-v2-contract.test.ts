import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const publicRoot = fileURLToPath(new URL("../../public/", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readPublic(path: string): Promise<string> {
  return readFile(`${publicRoot}${path}`, "utf8");
}

async function readRepository(path: string): Promise<string> {
  return readFile(`${repositoryRoot}${path}`, "utf8");
}

describe("Navigation Banner V2 contract", () => {
  it("removes runtime-injected CSS authority from the Navigation controller", async () => {
    const source = await readRepository(
      "apps/morro-digital-platform/src/navigation/navigation-guidance-ui.ts",
    );

    expect(source).not.toContain('createElement("style")');
    expect(source).not.toContain("navigation-guidance-v2-styles");
    expect(source).not.toContain("STYLE_ID");
    expect(source).not.toMatch(/z-index\s*:/u);
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
    expect(source).not.toContain("!important");
  });

  it("uses Design System V2 semantic tokens as the banner presentation authority", async () => {
    const [foundations, premium] = await Promise.all([
      readPublic("design-system-v2.css"),
      readPublic("premium-ux-v2.css"),
    ]);

    for (const token of [
      "--md-navigation-banner-max-inline-size",
      "--md-navigation-primary",
      "--md-navigation-primary-strong",
      "--md-navigation-arrival",
      "--md-navigation-surface",
      "--md-navigation-text",
      "--md-navigation-progress",
      "--md-navigation-danger",
      "--md-navigation-shadow",
    ]) {
      expect(foundations, `missing ${token}`).toContain(token);
      expect(premium, `Navigation does not consume ${token}`).toContain(
        `var(${token})`,
      );
    }

    expect(premium).toContain(
      'body[data-md-mode="navigation"] #instruction-banner',
    );
    expect(premium).toContain("var(--md-layer-navigation)");
    expect(premium).toContain("overflow: hidden !important;\n  padding: 0;");
    expect(premium).not.toContain("z-index: 2300");
    expect(premium).not.toContain("z-index: 2301");
  });

  it("composes the real shell with shared accessible banner and action primitives", async () => {
    const shell = await readRepository(
      "apps/morro-digital-platform/src/layouts/app-shell.ts",
    );

    expect(shell).toContain(
      'id="instruction-banner" class="instruction-banner md-banner md-navigation-banner hidden"',
    );
    expect(shell).toContain('aria-labelledby="instruction-main"');
    expect(shell).toContain(
      'id="instruction-main" class="instruction-main-text" role="status" aria-live="polite" aria-atomic="true"',
    );
    expect(shell).toContain('aria-controls="instruction-secondary"');
    expect(shell).toContain(
      'class="end-navigation-btn md-button md-button--destructive"',
    );
    expect(shell).toContain('id="instruction-secondary"');
  });

  it("keeps reduced motion and forced-colors coverage on the migrated surface", async () => {
    const premium = await readPublic("premium-ux-v2.css");
    const foundations = await readPublic("design-system-v2.css");

    expect(premium).toContain("@media (prefers-reduced-motion: reduce)");
    expect(foundations).toContain("@media (forced-colors: active)");
    expect(foundations).toContain("#minimize-navigation-btn");
    expect(foundations).toContain("#end-navigation-btn");
  });
});
