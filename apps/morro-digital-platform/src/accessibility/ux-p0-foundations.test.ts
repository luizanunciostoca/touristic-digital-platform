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

const foundationHref =
  "/apps/morro-digital-platform/public/design-system-v2.css";
const touristShellHref =
  "/apps/morro-digital-platform/public/tourist-shell-v2.css";
const homeBundleHref =
  "/apps/morro-digital-platform/public/dist/entry-css/home.css";

async function stylesheetOrderFor(
  surface: string,
  html: string,
  readManifest: () => Promise<string> = () =>
    readRepository("tooling/ci/entry-css-manifest.json"),
): Promise<string[]> {
  const hrefs = [
    ...html.matchAll(
      /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/giu,
    ),
  ].map((match) => {
    const href = match[1];
    if (href === undefined) throw new Error("STYLESHEET_HREF_CAPTURE_MISSING");
    return href;
  });
  if (surface !== "index.html" || !html.includes("data-entry-css")) {
    return hrefs;
  }
  expect(hrefs).toContain(homeBundleHref);
  const manifest = JSON.parse(await readManifest()) as {
    sources: { file: string }[];
  };
  const sources = manifest.sources.map(({ file }) => `/${file}`);
  return hrefs.flatMap((href) => (href === homeBundleHref ? sources : [href]));
}

function expectHomeAuthorityOrder(stylesheetOrder: string[]): void {
  expect(stylesheetOrder).toContain(foundationHref);
  const foundationIndex = stylesheetOrder.indexOf(foundationHref);
  const migratedConsumers = [
    "/apps/morro-digital-platform/public/commerce.css",
    "/apps/morro-digital-platform/public/explore-locations.css",
    "/apps/morro-digital-platform/public/navigation-map.css",
    "/apps/morro-digital-platform/public/assistant-v2.css",
    "/apps/morro-digital-platform/public/premium-ux-v2.css",
    touristShellHref,
  ];
  for (const consumer of migratedConsumers) {
    expect(stylesheetOrder).toContain(consumer);
    expect(foundationIndex).toBeLessThan(stylesheetOrder.indexOf(consumer));
  }
  expect(stylesheetOrder.at(-1)).toBe(touristShellHref);
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
    const srOnlyRule = css.match(/\.sr-only\s*\{([\s\S]*?)\}/u)?.[1] ?? "";

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

  it("centralizes focus, reduced motion and forced-colors behavior", async () => {
    const css = await readPublic("design-system-v2.css");

    expect(css).toContain(":focus-visible");
    expect(css).toContain("var(--md-focus-ring-color)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation-duration: 0.01ms !important");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("outline-color: Highlight");
  });

  it("covers critical public controls with the 44px target contract", async () => {
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
  });

  it("loads foundations before any surface-specific V2 authority", async () => {
    const surfaces = [
      "index.html",
      "business-dashboard.html",
      "business-onboarding.html",
      "experience.html",
      "tickets.html",
    ];
    for (const surface of surfaces) {
      const html = await readPublic(surface);
      const stylesheetOrder = await stylesheetOrderFor(surface, html);

      expect(stylesheetOrder, `${surface} does not load foundations`).toContain(
        foundationHref,
      );

      if (surface === "index.html") {
        expectHomeAuthorityOrder(stylesheetOrder);
      } else if (surface === "tickets.html") {
        const ticketingHref = "/ticketing.css";
        expect(stylesheetOrder).toContain(ticketingHref);
        expect(stylesheetOrder.indexOf(foundationHref)).toBeLessThan(
          stylesheetOrder.indexOf(ticketingHref),
        );
        expect(stylesheetOrder.at(-1)).toBe(ticketingHref);
      } else {
        expect(
          stylesheetOrder.at(-1),
          `${surface} retains its pre-migration foundation order`,
        ).toBe(foundationHref);
      }
    }
  });

  it("uses safe small and dynamic viewport units on primary shells", async () => {
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
  });

  it("keeps browser evidence for keyboard, 200% zoom, forced colors and overflow", async () => {
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
  });
});

describe("composed home accessibility stylesheet order", () => {
  const canonical = [
    foundationHref,
    "/apps/morro-digital-platform/public/commerce.css",
    "/apps/morro-digital-platform/public/explore-locations.css",
    "/apps/morro-digital-platform/public/navigation-map.css",
    "/apps/morro-digital-platform/public/assistant-v2.css",
    "/apps/morro-digital-platform/public/premium-ux-v2.css",
    touristShellHref,
  ];
  const htmlFor = (hrefs: string[], composed = true) =>
    hrefs
      .map(
        (href) =>
          `<link rel="stylesheet" href="${href}"${composed && href === homeBundleHref ? ' data-entry-css="home"' : ""}>`,
      )
      .join("\n");
  const manifestFor =
    (hrefs = canonical) =>
    async () =>
      JSON.stringify({
        sources: hrefs.map((href) => ({ file: href.slice(1) })),
      });

  it("preserves separately linked home styles without reading a manifest", async () => {
    const order = await stylesheetOrderFor(
      "index.html",
      htmlFor(canonical, false),
      async () => {
        throw new Error("UNEXPECTED_MANIFEST_READ");
      },
    );
    expect(order).toEqual(canonical);
    expectHomeAuthorityOrder(order);
  });

  it("expands a valid bundle in place and retains a preceding stylesheet", async () => {
    const before = "/before-home.css";
    const order = await stylesheetOrderFor(
      "index.html",
      htmlFor([before, homeBundleHref]),
      manifestFor(),
    );
    expect(order).toEqual([before, ...canonical]);
    expectHomeAuthorityOrder(order);
  });

  it("rejects reversed source authority inside a composed bundle", async () => {
    const reversed = [...canonical].reverse();
    const order = await stylesheetOrderFor(
      "index.html",
      htmlFor([homeBundleHref]),
      manifestFor(reversed),
    );
    expect(order).toEqual(reversed);
    expect(() => expectHomeAuthorityOrder(order)).toThrow();
  });

  it("retains and rejects a real commerce stylesheet after the bundle", async () => {
    const before = "/before-home.css";
    const commerce = "/apps/morro-digital-platform/public/commerce.css";
    const order = await stylesheetOrderFor(
      "index.html",
      htmlFor([before, homeBundleHref, commerce]),
      manifestFor(),
    );
    expect(order).toEqual([before, ...canonical, commerce]);
    expect(() => expectHomeAuthorityOrder(order)).toThrow();
  });

  it("retains and rejects an additional stylesheet after the bundle", async () => {
    const after = "/after-home.css";
    const order = await stylesheetOrderFor(
      "index.html",
      htmlFor([homeBundleHref, after]),
      manifestFor(),
    );
    expect(order).toEqual([...canonical, after]);
    expect(() => expectHomeAuthorityOrder(order)).toThrow();
  });
});
