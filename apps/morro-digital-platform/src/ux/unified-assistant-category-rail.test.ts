import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(repositoryRoot + path, "utf8");
}

describe("Unified Assistant horizontal category rail", () => {
  // Golden mobile density keeps approximately six categories visible at 390px.
  it("composes grabber, message, categories, composer and navigation in one dock", async () => {
    const shell = await readRepository(
      "apps/morro-digital-platform/src/layouts/app-shell.ts",
    );

    expect(shell).toContain('id="assistant-category-rail"');
    expect(shell).toContain('class="md-assistant-category-scroll"');
    expect(shell).toContain('className = "md-unified-dock-grabber"');
    expect(shell).toContain(
      "dock.append(grabber, messages, categories, composer, navigation)",
    );

    for (const value of [
      "beaches",
      "restaurants",
      "hotels",
      "shops",
      "transport",
      "attractions",
      "tours",
      "nightlife",
      "emergencies",
      "help",
    ]) {
      expect(shell).toContain(`data-assistant-category="${value}"`);
    }
  });

  it("routes category chips through the canonical Assistant option event", async () => {
    const shell = await readRepository(
      "apps/morro-digital-platform/src/layouts/app-shell.ts",
    );

    expect(shell).toContain('"morro:assistant-option-selected"');
    expect(shell).toContain('source: "unified-category-rail"');
    expect(shell).toContain("button?.dataset.assistantCategory");
    expect(shell).toContain("synchronizeCategorySelection");
    expect(shell).toContain('"aria-pressed"');
    expect(shell).not.toContain("showAssistantCategoryDirectly");
  });

  it("uses horizontal touch scrolling, scroll snap and canonical category tokens", async () => {
    const [css, tokens] = await Promise.all([
      readRepository("apps/morro-digital-platform/public/tourist-shell-v2.css"),
      readRepository("apps/morro-digital-platform/public/design-system-v2.css"),
    ]);

    expect(css).toContain("overflow-x: auto");
    expect(css).toContain("overflow-y: hidden");
    expect(css).toContain("touch-action: pan-x");
    expect(css).toContain("overscroll-behavior-inline: contain");
    expect(css).toContain("scroll-snap-type: x proximity");
    expect(css).toContain("scroll-snap-align: start");
    expect(css).toContain("scrollbar-width: none");
    expect(css).toContain('html[dir="rtl"]');
    expect(css).toContain("min-height: var(--md-touch-target-min)");
    expect(css).toContain("#assistant-category-rail::after");
    expect(css).toContain('content: "›"');
    expect(css).toContain("flex-basis: 3rem");
    expect(css).toContain("min-width: 3rem");

    for (const token of [
      "--md-unified-dock-category-height",
      "--md-unified-dock-category-gap",
      "--md-unified-dock-category-min-width",
      "--md-unified-dock-message-max-height",
      "--md-unified-dock-rich-max-height",
    ]) {
      expect(tokens).toContain(token);
    }
  });

  it("reuses the same rail for filters, places and place actions", async () => {
    const [control, place, css, copy] = await Promise.all([
      readRepository(
        "apps/morro-digital-platform/src/map/explore-locations-control.ts",
      ),
      readRepository(
        "apps/morro-digital-platform/src/map/place-bottom-sheet.ts",
      ),
      readRepository("apps/morro-digital-platform/public/tourist-shell-v2.css"),
      readRepository(
        "apps/morro-digital-platform/src/map/explore-v1-i18n.ts",
      ),
    ]);

    expect(control).toContain("const renderContextualRail");
    expect(control).toContain('activeStage === "filters" || activeStage === "places"');
    expect(control).toContain('"md-contextual-rail-source"');
    expect(control).toContain('renderContextualRail("detail"');
    expect(control).toContain("renderPlaceActionsRail");
    expect(control).toContain("actionsInContextualRail: true");
    expect(control).toContain("restoreCategoryRail()");
    expect(place).toContain("actionsInContextualRail?: boolean");
    expect(place).toContain('sheet.dataset.actionsSurface = "contextual-rail"');
    expect(css).toContain('[data-rail-stage="filters"]');
    expect(css).toContain('[data-rail-stage="places"]');
    expect(css).toContain('[data-rail-stage="detail"]');
    expect(css).toContain("#assistant-category-results.md-contextual-rail-source");
    expect(copy).toContain('pt: "Para surf"');
    expect(copy).not.toContain('pt: "Com ondas para surf"');
  });

  it("keeps search and semantic assistant navigation connected to the contextual rail", async () => {
    const [control, router, runtime] = await Promise.all([
      readRepository(
        "apps/morro-digital-platform/src/map/explore-locations-control.ts",
      ),
      readRepository(
        "apps/morro-digital-platform/src/assistant/assistant-menu-command-router.ts",
      ),
      readRepository(
        "apps/morro-digital-platform/src/assistant/browser-assistant-runtime.ts",
      ),
    ]);

    expect(control).toContain('action: "back-menu" as const');
    expect(control).toContain('value: "voltar_menu"');
    expect(router).toContain("data-context-rail-option");
    expect(router).toContain('data-rail-stage="menu"');
    expect(runtime).toContain("contextualButtons");
    expect(runtime).toContain("data-context-rail-option");
  });

  it("retires the old independent Discover category rail when the unified dock is active", async () => {
    const css = await readRepository(
      "apps/morro-digital-platform/public/tourist-shell-v2.css",
    );

    expect(css).toContain(
      'body[data-md-unified-dock="true"] #discover-category-rail',
    );
    expect(css).toMatch(
      /body\[data-md-unified-dock="true"\]\s+#discover-category-rail\s*\{[^}]*display:\s*none/isu,
    );
  });
});
