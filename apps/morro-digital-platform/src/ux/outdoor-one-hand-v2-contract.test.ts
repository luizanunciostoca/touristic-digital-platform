import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const publicRoot = fileURLToPath(new URL("../../public/", import.meta.url));

async function readPublic(path: string): Promise<string> {
  return readFile(publicRoot + path, "utf8");
}

describe("Outdoor and one-hand UX V2 contract", () => {
  it("keeps navigation operational copy readable outdoors", async () => {
    const css = await readPublic("premium-ux-v2.css");

    expect(css).toContain('body[data-md-mode="navigation"] #instruction-main');
    expect(css).toContain("font-size: clamp(1.25rem, 4.5vw, 1.5rem)");
    expect(css).toContain(
      'body[data-md-mode="navigation"] #instruction-details',
    );
    expect(css).toContain("font-size: 1rem");
    expect(css).toContain(
      'body[data-md-mode="navigation"] #minimize-navigation-btn',
    );
    expect(css).toContain("min-width: var(--md-touch-target-min)");
    expect(css).toContain("min-height: var(--md-touch-target-min)");
  });

  it("keeps critical mobile actions in the lower thumb region", async () => {
    const css = await readPublic("premium-ux-v2.css");

    expect(css).toContain("@media (max-width: 45rem)");
    expect(css).toContain(
      'body[data-md-mode="navigation"] .end-navigation-btn',
    );
    expect(css).toContain(
      "bottom: calc(var(--md-safe-bottom) + var(--md-space-4))",
    );
    expect(css).toContain("z-index: var(--md-layer-navigation)");
    expect(css).toContain("min-height: 3rem");
  });

  it("raises Tour and contextual action readability without editing legacy", async () => {
    const css = await readPublic("premium-ux-v2.css");

    expect(css).toContain('body[data-md-mode="tour"] .tour-stop-title');
    expect(css).toContain('body[data-md-mode="tour"] .tour-stop-desc');
    expect(css).toContain('body[data-md-mode="tour"] .tour-narration-btn');
    expect(css).toContain('body[data-md-mode="place"] .assistant-option-btn');
    expect(css).toContain(
      'body[data-md-mode="assistant"] .assistant-option-btn',
    );
    expect(css).toContain("touch-action: manipulation");
    expect(css).not.toContain("transition: all");
  });
});
