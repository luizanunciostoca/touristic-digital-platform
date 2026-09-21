import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(repositoryRoot + path, "utf8");
}

describe("Ticketing V2 visual authority", () => {
  it("loads V2 foundations before Ticketing feature styles", async () => {
    const html = await readRepository(
      "apps/morro-digital-platform/public/tickets.html",
    );

    const foundations = html.indexOf("design-system-v2.css");
    const premium = html.indexOf("premium-ux-v2.css");
    const feature = html.indexOf('href="/ticketing.css"');

    expect(foundations).toBeGreaterThan(-1);
    expect(premium).toBeGreaterThan(foundations);
    expect(feature).toBeGreaterThan(premium);
    expect(html).toContain('content="light dark"');
    expect(html).toContain('class="ticket-dialog md-dialog"');
    expect(html).toContain('class="md-input"');
    expect(html).toContain('id="quantity"');
  });

  it("keeps Ticketing on semantic V2 tokens without a local product palette", async () => {
    const css = await readRepository(
      "apps/morro-digital-platform/public/ticketing.css",
    );

    expect(css).toContain("font-family: var(--md-font-family-sans)");
    expect(css).toContain("var(--md-color-surface-canvas)");
    expect(css).toContain("var(--md-color-text-primary)");
    expect(css).toContain("var(--md-color-interactive-primary)");
    expect(css).toContain("var(--md-color-success)");
    expect(css).toContain("var(--md-color-warning)");
    expect(css).toContain("var(--md-color-danger)");
    expect(css).toContain("var(--md-touch-target-min)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("overscroll-behavior: contain");
    expect(css).not.toMatch(/font-family\s*:[^;]*Inter/iu);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
    expect(css).not.toMatch(/transition\s*:\s*all\b/iu);
    expect(css).not.toMatch(/z-index\s*:\s*-?\d+/iu);
    expect(css).not.toContain("!important");
  });

  it("uses real shared primitives for cards, controls, status, QR dialog and loading", async () => {
    const [html, runtime] = await Promise.all([
      readRepository("apps/morro-digital-platform/public/tickets.html"),
      readRepository("apps/morro-digital-platform/public/ticketing.js"),
    ]);

    for (const primitive of [
      "md-card",
      "md-button",
      "md-input",
      "md-badge",
      "md-dialog",
      "md-icon-button",
    ]) {
      expect(html).toContain(primitive);
    }

    expect(runtime).toContain("renderOfferSkeletons");
    expect(runtime).toContain("renderReservationSkeletons");
    expect(runtime).toContain("md-skeleton");
    expect(runtime).toContain("elements.dialog.showModal()");
    expect(runtime).toContain("elements.dialog.close()");
    expect(runtime).toContain("when.textContent = dateTime(offer.startsAt)");
    expect(runtime).toContain("availability md-badge md-badge--success");

    // Inventory is the canonical authority for the event date. Do not invent a
    // client-side date selector that the reservation contract cannot honor.
    expect(html).not.toMatch(/type="(?:date|datetime-local)"/u);
  });
});
