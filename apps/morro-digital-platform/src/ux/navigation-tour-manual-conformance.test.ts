import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const publicRoot = fileURLToPath(new URL("../../public/", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readPublic(name: string): Promise<string> {
  return readFile(`${publicRoot}${name}`, "utf8");
}

async function readRepository(path: string): Promise<string> {
  return readFile(`${repositoryRoot}${path}`, "utf8");
}

describe("Navigation / Tour UX Design V2 manual conformance", () => {
  it("composes Navigation as top guidance + map + one-hand lower summary", async () => {
    const [shell, premium] = await Promise.all([
      readRepository("apps/morro-digital-platform/src/layouts/app-shell.ts"),
      readPublic("premium-ux-v2.css"),
    ]);

    expect(shell).toContain('id="navigation-summary"');
    expect(shell).toContain('class="metrics-group navigation-summary-metrics"');
    expect(shell).toContain('id="instruction-distance"');
    expect(shell).toContain('id="instruction-time"');
    expect(shell).toContain('id="end-navigation-btn"');
    expect(premium).toContain(
      'body[data-md-mode="navigation"] #navigation-summary',
    );
    expect(premium).toContain(
      "bottom: max(var(--md-space-3), var(--md-safe-bottom))",
    );
    expect(premium).toContain(
      'body[data-md-mode="navigation"] #navigation-summary .end-navigation-btn',
    );
    expect(premium).toContain("position: static !important");
  });

  it("enforces mode priority over Assistant and floating Privacy chrome", async () => {
    const premium = await readPublic("premium-ux-v2.css");

    for (const selector of [
      'body[data-md-mode="navigation"] #assistant-input-area',
      'body[data-md-mode="navigation"] #assistant-messages',
      'body[data-md-mode="tour"] #assistant-input-area',
      'body[data-md-mode="tour"] #assistant-messages',
      'body[data-md-mode="navigation"] .analytics-consent-preferences.is-collapsed',
      'body[data-md-mode="tour"] .analytics-consent-preferences.is-collapsed',
    ]) {
      expect(premium).toContain(selector);
    }
    expect(premium).toContain("visibility: hidden !important");
    expect(premium).toContain("pointer-events: none !important");
  });

  it("keeps the Navigation position marker semantically prominent", async () => {
    const css = await readPublic("navigation-map.css");

    expect(css).toContain(
      'body[data-md-mode="navigation"] #map .navigation-user-location-marker::after',
    );
    expect(css).toContain("var(--md-navigation-primary)");
    expect(css).toContain("var(--md-navigation-inverse)");
    expect(css).not.toContain("rgba(229, 62, 62, 0.35)");
  });

  it("keeps Tour compact, map-first and free of technical sheet controls", async () => {
    const css = await readPublic("explore-locations.css");

    expect(css).toContain('#explore-flow-bottom-sheet[data-flow-kind="tour"]');
    expect(css).toContain("max-height: min(48dvh, 30rem)");
    expect(css).toContain(".explore-flow-sheet-drag-handle");
    expect(css).toContain(".explore-flow-sheet-state-controls");
    expect(css).toContain(
      '.explore-flow-sheet-option[data-value="__tour_exit__"]',
    );
    expect(css).toContain(
      '.explore-flow-sheet-option[data-value="__tour_cancel__"]',
    );
    expect(css).toContain(".tour-stop-progress-bar");
  });

  it("uses real Tour authority while exposing tour title and x/y progress", async () => {
    const controller = await readRepository(
      "apps/morro-digital-platform/src/map/immersive-tour-v1-controller.ts",
    );
    const catalog = await readRepository(
      "apps/morro-digital-platform/src/config/tour-catalog.ts",
    );
    const editorial = await readRepository(
      "apps/morro-digital-platform/src/config/tour-editorial-source.ts",
    );

    expect(controller).toContain(
      "${tour.title} · ${copy.stopLabel(current, tour.stops.length)}",
    );
    expect(controller).toContain("localizeMorroTour");
    expect(catalog).toContain("export const morroTourCatalog");
    expect(editorial).toContain("v1TourEditorialSource");
  });
});
