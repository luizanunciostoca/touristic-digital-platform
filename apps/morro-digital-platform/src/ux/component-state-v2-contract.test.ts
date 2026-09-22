import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const publicRoot = fileURLToPath(new URL("../../public/", import.meta.url));

async function readPublic(path: string): Promise<string> {
  return readFile(publicRoot + path, "utf8");
}

describe("UX Design V2 component-state contract", () => {
  it("defines visible loading and disabled states in the shared primitive authority", async () => {
    const css = await readPublic("design-system-v2.css");

    expect(css).toContain('.md-button[aria-busy="true"]::before');
    expect(css).toContain("animation: md-spin 700ms linear infinite");
    expect(css).toContain(":is(.md-input, .md-textarea, .md-select):disabled");
    expect(css).toContain("background: var(--md-color-surface-subtle)");
    expect(css).toContain("opacity: var(--md-state-disabled-opacity)");
  });

  it("keeps the manual component-state primitives available for visual regression", async () => {
    const [foundations, premium] = await Promise.all([
      readPublic("design-system-v2.css"),
      readPublic("premium-ux-v2.css"),
    ]);

    for (const selector of [
      ".md-button",
      ".md-icon-button",
      ".md-input",
      ".md-select",
      ".md-card",
      ".md-dialog",
      ".md-bottom-sheet",
      ".md-skeleton",
    ]) {
      expect(foundations).toContain(selector);
    }

    for (const state of ["peek", "half", "full"]) {
      expect(premium).toContain(`data-sheet-state="${state}"`);
    }

    expect(foundations).toContain("box-sizing: border-box");
    expect(foundations).toContain("max-inline-size: 100%");
    expect(foundations).toContain("@media (forced-colors: active)");
    expect(foundations).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
