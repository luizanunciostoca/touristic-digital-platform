import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(repositoryRoot + path, "utf8");
}

describe("Context Rail button system", () => {
  it("uses one shared component for categories and dynamic contextual stages", async () => {
    const [shell, control] = await Promise.all([
      readRepository("apps/morro-digital-platform/src/layouts/app-shell.ts"),
      readRepository(
        "apps/morro-digital-platform/src/map/explore-locations-control.ts",
      ),
    ]);

    expect(shell).toContain("md-context-rail-button");
    expect(shell).toContain("md-context-rail-button--category");
    expect(shell).toContain("data-context-rail-back");
    expect(control).toContain("md-context-rail-button--${railKind}");
    expect(control).toContain("button.dataset.railKind = railKind");
    expect(control).toContain("button.dataset.railVariant = railVariant");
    expect(control).toContain('action === "primary"');
    expect(control).toContain('action.startsWith("back-")');
    expect(control).toContain("contextualRailBack.hidden = false");
    expect(control).toContain("contextualRailBack.onclick");
    expect(control).toContain("if (action.startsWith(\"back-\") || action === \"back-menu\") continue");
  });

  it("owns reusable geometry in design tokens", async () => {
    const tokens = await readRepository(
      "apps/morro-digital-platform/public/design-system-v2.css",
    );

    for (const token of [
      "--md-context-rail-control-height",
      "--md-context-rail-control-radius",
      "--md-context-rail-control-gap",
      "--md-context-rail-control-padding-inline",
      "--md-context-rail-label-size",
      "--md-context-rail-icon-size",
      "--md-context-rail-category-min-width",
      "--md-context-rail-place-min-width",
      "--md-context-rail-action-min-width",
      "--md-context-rail-back-size",
    ]) {
      expect(tokens).toContain(token);
    }
  });

  it("separates selected navigation state from primary action priority", async () => {
    const css = await readRepository(
      "apps/morro-digital-platform/public/tourist-shell-v2.css",
    );

    expect(css).toContain(
      '.md-context-rail-button--category[aria-pressed="true"]',
    );
    expect(css).toContain(
      '.md-context-rail-button[data-rail-variant="primary"]',
    );
    expect(css).toContain(
      '.md-context-rail-button[data-rail-variant="secondary"]',
    );
    expect(css).toContain(".md-context-rail-back");
    expect(css).toContain(".md-context-rail-back[hidden]");
    expect(css).toContain("var(--md-context-rail-back-size)");
    expect(css).toContain("var(--md-context-rail-control-height)");
    expect(css).toContain("var(--md-context-rail-control-radius)");
    expect(css).toContain("white-space: nowrap");
  });

  it("keeps horizontal rail accessibility and interaction contracts", async () => {
    const css = await readRepository(
      "apps/morro-digital-platform/public/tourist-shell-v2.css",
    );

    expect(css).toContain("overflow-x: auto");
    expect(css).toContain("scroll-snap-type: x proximity");
    expect(css).toContain("touch-action: pan-x");
    expect(css).toContain('html[dir="rtl"]');
    expect(css).toContain(".md-context-rail-button:focus-visible");
    expect(css).toContain(".md-context-rail-button:disabled");
    expect(css).toContain(".md-context-rail-back:focus-visible");
    expect(css).toContain('html[dir="rtl"]');
    expect(css).toContain(".md-context-rail-back-icon");
  });
});
