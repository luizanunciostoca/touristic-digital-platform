import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(`${repositoryRoot}${path}`, "utf8");
}

describe("Carousel V2 contract", () => {
  it("uses semantic Design System tokens instead of independent palette values", async () => {
    const css = await readRepository(
      "apps/morro-digital-platform/public/assistant-photo-carousel.css",
    );

    expect(css).toContain("var(--md-color-border)");
    expect(css).toContain("var(--md-color-surface-glass)");
    expect(css).toContain("var(--md-color-skeleton-base)");
    expect(css).toContain("var(--md-radius-lg)");
    expect(css).toContain("var(--md-font-family-sans)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
    expect(css).not.toContain("transition: all");
  });

  it("exposes a keyboard-focusable region/list/listitem presentation", async () => {
    const runtime = await readRepository(
      "apps/morro-digital-platform/src/assistant/browser-assistant-runtime.ts",
    );

    expect(runtime).toContain('container.setAttribute("role", "region")');
    expect(runtime).toContain('track.setAttribute("role", "list")');
    expect(runtime).toContain("track.tabIndex = 0");
    expect(runtime).toContain('figure.setAttribute("role", "listitem")');
    expect(runtime).toContain('event.key !== "ArrowLeft"');
    expect(runtime).toContain('event.key !== "ArrowRight"');
    expect(runtime).toContain('event.key === "Home"');
    expect(runtime).toContain('event.key === "End"');
    expect(runtime).toContain("prefers-reduced-motion: reduce");
  });

  it("keeps the physical photo browser gate authoritative for V2 semantics", async () => {
    const workflow = await readRepository(
      ".github/workflows/assistant-photo-browser-contract.yml",
    );

    expect(workflow).toContain("Carousel V2 semantics drifted");
    expect(workflow).toContain("data-active-index");
    expect(workflow).toContain("assistant-photo-carousel.css");
  });
});
