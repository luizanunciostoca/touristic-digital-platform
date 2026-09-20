import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const publicRoot = fileURLToPath(new URL("../../public/", import.meta.url));

async function readPublic(path: string): Promise<string> {
  return readFile(publicRoot + path, "utf8");
}

describe("Ticketing UX Design V2 contract", () => {
  it("uses the canonical Tourist UI typography and semantic tokens", async () => {
    const [css, designSystem] = await Promise.all([
      readPublic("ticketing.css"),
      readPublic("design-system-v2.css"),
    ]);

    expect(css).toContain("font-family: var(--md-font-family-sans)");
    expect(css).not.toMatch(/\bInter\b/u);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
    expect(css).not.toContain("transition: all");
    expect(css).not.toContain("!important");

    for (const token of [
      "--md-color-brand",
      "--md-color-brand-strong",
      "--md-color-surface-canvas",
      "--md-color-surface-card",
      "--md-color-surface-glass",
      "--md-color-surface-elevated",
      "--md-color-text-primary",
      "--md-color-text-secondary",
      "--md-color-text-inverse",
      "--md-color-interactive-primary",
      "--md-color-interactive-secondary",
      "--md-color-success",
      "--md-color-warning",
      "--md-color-danger",
      "--md-color-info",
    ]) {
      expect(designSystem).toContain(token);
    }
  });

  it("adopts shared primitives in static and dynamic Ticketing consumers", async () => {
    const [html, runtime] = await Promise.all([
      readPublic("tickets.html"),
      readPublic("ticketing.js"),
    ]);

    expect(html).toContain("panel md-card");
    expect(html).toContain("md-button md-button--primary");
    expect(html).toContain("md-button md-button--secondary");
    expect(html).toContain('class="md-input"');
    expect(html).toContain("ticket-dialog md-dialog");
    expect(html).toContain("dialog-close md-icon-button");

    expect(runtime).toContain("offer-card md-card");
    expect(runtime).toContain("reservation-card md-card");
    expect(runtime).toContain("availability md-badge md-badge--success");
    expect(runtime).toContain("status md-badge");
  });

  it("renders progressive loading structure without weakening accessibility", async () => {
    const [css, runtime] = await Promise.all([
      readPublic("ticketing.css"),
      readPublic("ticketing.js"),
    ]);

    expect(runtime).toContain("renderOfferSkeletons()");
    expect(runtime).toContain("renderReservationSkeletons()");
    expect(runtime).toContain('setAttribute("aria-busy", "true")');
    expect(runtime).toContain('setAttribute("aria-hidden", "true")');
    expect(runtime).toContain('removeAttribute("aria-busy")');
    expect(css).toContain(".ticketing-skeleton-card");
    expect(css).toContain(".md-skeleton");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (forced-colors: active)");
  });

  it("uses the formal V2 stacking scale and theme contract", async () => {
    const designSystem = await readPublic("design-system-v2.css");

    for (const token of [
      "--md-layer-map",
      "--md-layer-marker",
      "--md-layer-map-control",
      "--md-layer-dock",
      "--md-layer-sheet",
      "--md-layer-navigation",
      "--md-layer-dialog",
      "--md-layer-tour",
      "--md-layer-toast",
      "--md-layer-system",
    ]) {
      expect(designSystem).toContain(token);
    }

    expect(designSystem).toContain('[data-theme="dark"]');
    expect(designSystem).toContain('[data-destination-theme="morro"]');
  });
});
