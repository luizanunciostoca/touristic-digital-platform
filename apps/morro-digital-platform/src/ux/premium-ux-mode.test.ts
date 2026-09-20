import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { resolveMorroUxMode } from "./premium-ux-mode.js";

const publicRoot = fileURLToPath(new URL("../../public/", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readPublic(path: string): Promise<string> {
  return readFile(publicRoot + path, "utf8");
}

async function readRepository(path: string): Promise<string> {
  return readFile(repositoryRoot + path, "utf8");
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
    expect(
      resolveMorroUxMode({ ...baseline, assistantActive: true }),
    ).toBe("assistant");
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

  it("establishes the canonical layered CSS architecture", async () => {
    const css = await readPublic("premium-ux-v2.css");

    expect(css).toContain(
      "@layer reset, vendor, legacy, tokens, base, components, features, utilities, overrides;",
    );
    expect(css).toContain("@layer tokens");
    expect(css).toContain("@layer components");
    expect(css).toContain("@layer features");
    expect(css).toContain("@layer utilities");
    expect(css).toContain("@layer overrides");
    expect(css).not.toContain("transition: all");
  });

  it("provides reusable peek, half and full bottom-sheet states", async () => {
    const css = await readPublic("premium-ux-v2.css");

    for (const state of ["peek", "half", "full"]) {
      expect(css).toContain('.md-bottom-sheet[data-sheet-state="' + state + '"]');
    }
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

  it("loads the premium bridge after feature/legacy CSS but before Design System V2", async () => {
    for (const surface of ["index.html", "experience.html", "tickets.html"]) {
      const html = await readPublic(surface);
      const hrefs = [
        ...html.matchAll(
          /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/giu,
        ),
      ].map((match) => match[1]);

      const premium =
        "/apps/morro-digital-platform/public/premium-ux-v2.css";
      const foundations =
        "/apps/morro-digital-platform/public/design-system-v2.css";

      expect(hrefs).toContain(premium);
      expect(hrefs).toContain(foundations);
      expect(hrefs.indexOf(premium)).toBe(hrefs.indexOf(foundations) - 1);
      expect(hrefs.at(-1)).toBe(foundations);
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
