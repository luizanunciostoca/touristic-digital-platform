import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const publicRoot = fileURLToPath(new URL("../../public/", import.meta.url));

async function readPublic(path: string): Promise<string> {
  return readFile(publicRoot + path, "utf8");
}

describe("Commerce UX Design V2 contract", () => {
  it("uses canonical Tourist UI typography and semantic tokens", async () => {
    const css = await readPublic("commerce.css");

    expect(css).toContain("font-family: var(--md-font-family-sans)");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
    expect(css).not.toContain("!important");
    expect(css).not.toContain("transition: all");
    expect(css).toContain("var(--md-color-surface-canvas)");
    expect(css).toContain("var(--md-color-interactive-primary)");
    expect(css).toContain("var(--md-layer-dock)");
  });

  it("uses shared card and button primitives in the real Commerce surface", async () => {
    const html = await readPublic("experience.html");

    expect(html).toContain("commerce-detail-card md-card");
    expect(html).toContain("commerce-detail-meta md-card");
    expect(html).toContain("md-button md-button--primary");
    expect(html).toContain("md-button md-button--secondary");
    expect(html).toContain('data-md-mode="commerce"');
    expect(html).toContain('data-destination-theme="morro"');
  });

  it("renders a progressive loading skeleton with accessible status copy", async () => {
    const [html, css] = await Promise.all([
      readPublic("experience.html"),
      readPublic("commerce.css"),
    ]);

    expect(html).toContain("commerce-detail-loading-copy");
    expect(html).toContain("commerce-detail-skeleton");
    expect(html).toContain("md-skeleton");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-hidden="true"');
    expect(css).toContain(".commerce-detail-skeleton");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (forced-colors: active)");
  });

  it("keeps mobile primary actions in the lower thumb-reachable region", async () => {
    const css = await readPublic("commerce.css");

    expect(css).toContain("position: sticky");
    expect(css).toContain(
      "bottom: max(var(--md-space-3), var(--md-safe-bottom))",
    );
    expect(css).toContain("min-height: 3rem");
  });
});
