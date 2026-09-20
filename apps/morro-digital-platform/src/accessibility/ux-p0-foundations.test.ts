import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const publicRoot = fileURLToPath(new URL("../../public/", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readPublic(path: string): Promise<string> {
  return readFile(`${publicRoot}${path}`, "utf8");
}

async function readRepository(path: string): Promise<string> {
  return readFile(`${repositoryRoot}${path}`, "utf8");
}

describe("UX P0 + Design System V2 foundations", () => {
  it("keeps browser zoom under user control", async () => {
    const html = await readPublic("index.html");
    const viewport =
      html.match(/<meta\s+name="viewport"[\s\S]*?content="([^"]+)"/u)?.[1] ??
      "";

    expect(viewport).toContain("width=device-width");
    expect(viewport).toContain("initial-scale=1.0");
    expect(viewport).not.toContain("maximum-scale");
    expect(viewport).not.toContain("user-scalable=no");
  });

  it("keeps visually hidden content in the accessibility tree", async () => {
    const css = await readPublic("styles.css");
    const hiddenRule = css.match(/\.hidden\s*\{([\s\S]*?)\}/u)?.[1] ?? "";
    const srOnlyRule =
      css.match(/\.sr-only\s*\{([\s\S]*?)\}/u)?.[1] ?? "";

    expect(hiddenRule).toContain("display: none !important");
    expect(srOnlyRule).not.toContain("display: none");
    expect(srOnlyRule).toContain("clip-path: inset(50%)");
    expect(srOnlyRule).toContain("white-space: nowrap");
    expect(srOnlyRule).toContain("position: absolute");
  });

  it("defines the complete canonical token contract", async () => {
    const css = await readPublic("design-system-v2.css");
    const requiredTokens = [
      "--md-color-brand-primary",
      "--md-color-success",
      "--md-font-family-sans",
      "--md-font-size-md",
      "--md-space-4",
      "--md-radius-md",
      "--md-elevation-2",
      "--md-motion-duration-normal",
      "--md-breakpoint-mobile",
      "--md-z-modal",
      "--md-touch-target-min",
      "--md-focus-ring-color",
      "--md-safe-top",
      "--md-safe-bottom",
    ];

    for (const token of requiredTokens) {
      expect(css, `missing ${token}`).toContain(token);
    }

    expect(css).toContain("--md-touch-target-min: 2.75rem");
  });

  it("provides the requested foundation component primitives", async () => {
    const css = await readPublic("design-system-v2.css");
    const primitives = [
      ".md-button",
      ".md-icon-button",
      ".md-input",
      ".md-textarea",
      ".md-select",
      ".md-badge",
      ".md-chip",
      ".md-spinner",
      ".md-skeleton",
      ".md-card",
      ".md-dialog",
      ".md-bottom-sheet",
      ".md-toast",
      ".md-banner",
    ];

    for (const primitive of primitives) {
      expect(css, `missing ${primitive}`).toContain(primitive);
    }
  });

  it(
    "centralizes focus, reduced motion and forced-colors behavior",
    async () => {
    const css = await readPublic("design-system-v2.css");

    expect(css).toContain(":focus-visible");
    expect(css).toContain("var(--md-focus-ring-color)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation-duration: 0.01ms !important");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("outline-color: Highlight");
    },
  );

  it(
    "covers critical public controls with the 44px target contract",
    async () => {
    const css = await readPublic("design-system-v2.css");
    const criticalSelectors = [
      ".control-button",
      ".close-button",
      ".map-control-button",
      ".mapboxgl-ctrl button",
      ".mapboxgl-popup-close-button",
      "#assistant-input-area button",
      ".voice-selector-toggle",
      ".assistant-option-btn",
      ".tour-popup-btn",
      ".tour-narration-btn",
      "#minimize-navigation-btn",
      "#end-navigation-btn",
      ".dialog-close",
      ".md-business-profile-close",
      ".md-business-profile-action",
      ".icon-button",
      ".nav-item",
      ".button",
    ];

    for (const selector of criticalSelectors) {
      expect(css, `missing touch target selector ${selector}`).toContain(
        selector,
      );
    }

    expect(css).toContain(".biz-setup-back");
    expect(css).toContain(".biz-demo-back-btn");
    expect(css).toContain(".plans-back-btn");
    expect(css).toContain("#assistant-voice-selector.minimized");
    },
  );

  it(
    "loads foundations after feature CSS on the primary public surfaces",
    async () => {
    const surfaces = [
      "index.html",
      "business-dashboard.html",
      "business-onboarding.html",
      "experience.html",
      "tickets.html",
    ];
    const foundationHref =
      "/apps/morro-digital-platform/public/design-system-v2.css";

    for (const surface of surfaces) {
      const html = await readPublic(surface);
      const stylesheetHrefs = [
        ...html.matchAll(
          /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/giu,
        ),
      ].map((match) => match[1]);

      expect(stylesheetHrefs, `${surface} does not load foundations`).toContain(
        foundationHref,
      );
      expect(
        stylesheetHrefs.at(-1),
        `${surface} must load foundations after feature CSS`,
      ).toBe(foundationHref);
    }
    },
  );

  it(
    "uses safe small and dynamic viewport units on primary shells",
    async () => {
    const files = [
      "styles.css",
      "business-dashboard.css",
      "business-onboarding.css",
      "commerce.css",
    ];

    for (const file of files) {
      const css = await readPublic(file);
      expect(css, `${file} missing svh fallback`).toContain("100svh");
      expect(css, `${file} missing dvh fallback`).toContain("100dvh");
    }

    const foundations = await readPublic("design-system-v2.css");
    for (const selector of [
      ".app-shell",
      "#onboarding-overlay",
      ".weather-forecast-modal",
      ".satellite-control-panel",
      "#assistant-voice-selector",
    ]) {
      expect(
        foundations,
        `missing post-legacy viewport override ${selector}`,
      ).toContain(selector);
    }
    },
  );

  it(
    "keeps browser evidence for keyboard, 200% zoom, forced colors and overflow",
    async () => {
    const homeFirstRun = await readRepository(
      ".github/workflows/home-first-run-browser-regression.yml",
    );
    const navigationAccessibility = await readRepository(
      ".github/workflows/navigation-accessibility-baseline.yml",
    );
    const homeResponsive = await readRepository(
      ".github/workflows/v1-home-responsive-browser-regression.yml",
    );
    const tourResponsive = await readRepository(
      ".github/workflows/v1-tour-responsive-browser-regression.yml",
    );

    expect(homeFirstRun).toContain("page.keyboard.press('Tab')");
    expect(navigationAccessibility).toContain("forcedColors: true");
    expect(navigationAccessibility).toContain("text-200-mobile");
    expect(homeResponsive).toContain("horizontal overflow");
    expect(tourResponsive).toContain("horizontal overflow");
    },
  );
});
