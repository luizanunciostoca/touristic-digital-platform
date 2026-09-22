import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  installPremiumUxModePresenter,
  resolveMorroUxMode,
} from "./premium-ux-mode.js";

const publicRoot = fileURLToPath(new URL("../../public/", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readPublic(path: string): Promise<string> {
  return readFile(publicRoot + path, "utf8");
}

async function readRepository(path: string): Promise<string> {
  return readFile(repositoryRoot + path, "utf8");
}

function createClassList() {
  const values = new Set<string>();
  return {
    add(...tokens: string[]) {
      for (const token of tokens) values.add(token);
    },
    remove(...tokens: string[]) {
      for (const token of tokens) values.delete(token);
    },
    contains(token: string) {
      return values.has(token);
    },
  };
}

class TestMutationObserver {
  static current: TestMutationObserver | null = null;

  private disconnected = false;

  constructor(private readonly callback: MutationCallback) {
    TestMutationObserver.current = this;
  }

  observe() {}

  disconnect() {
    this.disconnected = true;
  }

  flush() {
    if (this.disconnected) return;
    this.callback([], this as unknown as MutationObserver);
  }
}

function modeFixture() {
  TestMutationObserver.current = null;

  const body = {
    classList: createClassList(),
    dataset: {},
  } as unknown as HTMLElement;
  const map = {
    dataset: {},
  } as unknown as HTMLElement;

  const document = {
    body,
    defaultView: { MutationObserver: TestMutationObserver },
    getElementById(id: string) {
      return id === "map" ? map : null;
    },
    querySelector() {
      return null;
    },
  } as unknown as Document;

  return {
    document,
    body,
    map,
    flush() {
      TestMutationObserver.current?.flush();
    },
  };
}

describe("Chat 6 CSS modernization + Premium UX foundations", () => {
  it("resolves presentation modes with safety-first precedence", () => {
    const baseline = {
      navigationActive: false,
      immersiveTourActive: false,
      placeActive: false,
      commerceActive: false,
      assistantActive: false,
    } as const;

    expect(resolveMorroUxMode(baseline)).toBe("discover");
    expect(resolveMorroUxMode({ ...baseline, assistantActive: true })).toBe(
      "assistant",
    );
    expect(resolveMorroUxMode({ ...baseline, commerceActive: true })).toBe(
      "commerce",
    );
    expect(resolveMorroUxMode({ ...baseline, placeActive: true })).toBe(
      "place",
    );
    expect(
      resolveMorroUxMode({
        ...baseline,
        placeActive: true,
        assistantActive: true,
      }),
    ).toBe("place");
    expect(
      resolveMorroUxMode({
        ...baseline,
        immersiveTourActive: true,
        placeActive: true,
        assistantActive: true,
      }),
    ).toBe("tour");
    expect(
      resolveMorroUxMode({
        ...baseline,
        navigationActive: true,
        immersiveTourActive: true,
        placeActive: true,
        assistantActive: true,
      }),
    ).toBe("navigation");
  });

  it("synchronizes live DOM mode transitions through MutationObserver", () => {
    const view = modeFixture();
    const presenter = installPremiumUxModePresenter({
      document: view.document,
    });

    expect(presenter.mode).toBe("discover");
    expect(view.body.dataset.mdMode).toBe("discover");

    view.body.classList.add("assistant-modal-open");
    view.flush();
    expect(presenter.mode).toBe("assistant");

    view.map.dataset.exploreStage = "detail";
    view.flush();
    expect(presenter.mode).toBe("place");

    view.map.dataset.activeTour = "volta-a-ilha";
    view.map.dataset.tourState = "switching";
    view.flush();
    expect(presenter.mode).toBe("place");

    view.map.dataset.tourState = "ready";
    view.flush();
    expect(presenter.mode).toBe("place");

    view.map.dataset.tourFlowId = "volta-a-ilha";
    view.map.dataset.tourFlowStage = "intro";
    view.flush();
    expect(presenter.mode).toBe("tour");

    view.body.classList.add("navigation-active");
    view.flush();
    expect(presenter.mode).toBe("navigation");

    view.body.classList.remove("navigation-active");
    delete view.map.dataset.activeTour;
    view.map.dataset.tourState = "idle";
    view.map.dataset.tourFlowId = "trilha-gamboa";
    view.map.dataset.tourFlowStage = "stop";
    view.flush();
    expect(presenter.mode).toBe("tour");

    delete view.map.dataset.tourFlowId;
    view.flush();
    expect(presenter.mode).toBe("place");

    presenter.destroy();
    view.map.dataset.exploreStage = "list";
    view.flush();
    expect(presenter.mode).toBe("place");
  });

  it("establishes the canonical layered CSS architecture", async () => {
    const [premium, designSystem] = await Promise.all([
      readPublic("premium-ux-v2.css"),
      readPublic("design-system-v2.css"),
    ]);

    for (const css of [premium, designSystem]) {
      expect(css).toContain(
        "@layer reset, vendor, legacy, tokens, base, components, features, utilities, overrides;",
      );
    }
    expect(designSystem).toContain("@layer tokens");
    expect(premium).toContain("@layer components");
    expect(premium).toContain("@layer features");
    expect(premium).toContain("@layer utilities");
    expect(premium).toContain("@layer overrides");
    expect(premium).not.toContain("transition: all");
  });

  it("provides reusable peek, half and full bottom-sheet states", async () => {
    const css = await readPublic("premium-ux-v2.css");

    for (const state of ["peek", "half", "full"]) {
      expect(css).toContain(
        '.md-bottom-sheet[data-sheet-state="' + state + '"]',
      );
    }
    expect(css).toContain(".md-bottom-sheet-content");
    expect(css).toContain("overflow-y: auto");
    expect(css).toContain("min-height: 0");
    expect(css).toContain("overscroll-behavior: contain");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (forced-colors: active)");
  });

  it("narrows non-legacy Explore transitions to semantic properties", async () => {
    const css = await readPublic("explore-locations.css");

    expect(css).not.toContain("transition: var(--transition)");
    expect(css).toContain("var(--md-motion-duration-normal");
    expect(css).toContain("background-color");
    expect(css).toContain("box-shadow");
  });

  it("declutters live controls without reintroducing the stale controls selector", async () => {
    const css = await readPublic("premium-ux-v2.css");

    expect(css).not.toContain("#controls");
    expect(css).toContain("#globe-map-control");
    expect(css).not.toContain(".quick-actions");
    expect(css).toContain(":has([data-explore-category])");
  });

  it("composes real controls around place, assistant, navigation and tour priorities", async () => {
    const css = await readPublic("premium-ux-v2.css");

    expect(css).toContain('body[data-md-mode="place"] #weather-widget');
    expect(css).toContain('body[data-md-mode="place"] #globe-map-control');
    expect(css).not.toContain(
      'body:not(.tour-active)[data-md-mode="assistant"] #weather-widget',
    );
    expect(css).not.toContain(
      'body:not(.tour-active)[data-md-mode="assistant"] #globe-map-control',
    );
    expect(css).toContain('body[data-md-mode="navigation"] #submenu');
    expect(css).toContain('body[data-md-mode="tour"] #submenu');
    expect(css).toMatch(
      /body\[data-md-mode="navigation"\]:not\(\.assistant-modal-open\)\s+#assistant-input-area/u,
    );
    expect(css).toMatch(
      /body\[data-md-mode="tour"\]:not\(\.assistant-modal-open\)\s+#assistant-input-area/u,
    );
    expect(css).toContain("visibility: hidden");
    expect(css).toContain("pointer-events: none");
    expect(css).not.toContain("transition: all");
  });

  it("loads V2 foundations before the active Tourist shell authority", async () => {
    for (const surface of ["index.html", "experience.html", "tickets.html"]) {
      const html = await readPublic(surface);
      const hrefs = [
        ...html.matchAll(
          /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/giu,
        ),
      ].map((match) => match[1]);

      const premium = "/apps/morro-digital-platform/public/premium-ux-v2.css";
      const foundations =
        "/apps/morro-digital-platform/public/design-system-v2.css";
      const touristShell =
        "/apps/morro-digital-platform/public/tourist-shell-v2.css";

      expect(hrefs).toContain(premium);
      expect(hrefs).toContain(foundations);

      if (surface === "tickets.html") {
        const ticketing = "/ticketing.css";
        expect(hrefs).toContain(ticketing);
        expect(hrefs.indexOf(foundations)).toBeLessThan(hrefs.indexOf(premium));
        expect(hrefs.indexOf(premium)).toBeLessThan(hrefs.indexOf(ticketing));
        expect(hrefs.at(-1)).toBe(ticketing);
      } else if (surface === "index.html") {
        expect(hrefs).toContain(touristShell);
        expect(hrefs.indexOf(foundations)).toBeLessThan(hrefs.indexOf(premium));
        expect(hrefs.indexOf(premium)).toBeLessThan(
          hrefs.indexOf(touristShell),
        );
        expect(hrefs.at(-1)).toBe(touristShell);
      } else {
        expect(hrefs.indexOf(premium)).toBe(hrefs.indexOf(foundations) - 1);
        expect(hrefs).not.toContain(touristShell);
        expect(hrefs.at(-1)).toBe(foundations);
      }
    }
  });

  it("marks standalone commerce surfaces without coupling business logic to CSS", async () => {
    for (const surface of ["experience.html", "tickets.html"]) {
      const html = await readPublic(surface);
      expect(html).toMatch(/<body\b[^>]*data-md-mode=["']commerce["']/u);
    }
  });

  it("installs mode presentation without using onboarding tour-active as immersive TOUR authority", async () => {
    const entry = await readRepository(
      "apps/morro-digital-platform/src/browser-entry.ts",
    );
    const presenter = await readRepository(
      "apps/morro-digital-platform/src/ux/premium-ux-mode.ts",
    );

    expect(entry).toContain("installPremiumUxModePresenter");
    expect(presenter).toContain('body.classList.contains("navigation-active")');
    expect(presenter).toContain('map?.dataset.exploreStage === "detail"');
    expect(presenter).toContain("hasActiveImmersiveTour(map)");
    expect(presenter).toContain("IMMERSIVE_TOUR_FLOW_STAGES");
    expect(presenter).toContain("flowTourId");
    expect(presenter).not.toContain('tourState === "ready"');
    expect(presenter).not.toContain('classList.contains("tour-active")');
  });

  it("documents frozen legacy evidence as a non-edit boundary", async () => {
    const doc = await readRepository(
      "docs/ux/chat6-css-modernization-premium-ux.md",
    );
    expect(doc).toContain("public/legacy/**");
    expect(doc).toContain("não é editado");
  });
});
