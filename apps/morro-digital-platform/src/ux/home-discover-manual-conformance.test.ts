import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(repositoryRoot + path, "utf8");
}

describe("Home / Discover UX V2 manual conformance", () => {
  it("separates destination identity from Assistant welcome copy", async () => {
    const [shell, i18n] = await Promise.all([
      readRepository("apps/morro-digital-platform/src/layouts/app-shell.ts"),
      readRepository(
        "apps/morro-digital-platform/src/runtime/shell-v1-i18n.ts",
      ),
    ]);

    expect(shell).toContain(
      '<span class="md-home-eyebrow">Morro Digital</span>',
    );
    expect(shell).toContain("<h1>Morro de São Paulo</h1>");
    expect(shell).not.toContain('<h1 data-i18n="welcome_message">');
    expect(i18n).toContain('"welcome_message"');
    expect(i18n).toContain('"assistant_welcome_message"');
    expect(i18n).toContain(
      '"Bem-vindo ao Morro Digital!\\nPosso ajudar você a encontrar praias, passeios, restaurantes e experiências."',
    );
    expect(shell).toContain("isInitialWelcome");
    expect(shell).toContain("messagesArea.scrollTop = 0");
  });

  it("keeps the map dominant and exposes exactly five canonical bottom actions", async () => {
    const shell = await readRepository(
      "apps/morro-digital-platform/src/layouts/app-shell.ts",
    );

    for (const action of ["explore", "tours", "saved", "tickets", "profile"]) {
      expect(shell).toContain(`data-home-nav-action="${action}"`);
    }

    expect(shell).toContain('id="home-bottom-navigation"');
    expect(shell).toContain('href="/tickets.html"');
    expect(shell).toContain('id="home-profile-panel"');
    expect(shell).toContain('id="home-privacy-button"');
    expect(shell).not.toContain("quick-actions");
    expect(shell).not.toContain("data-assistant-floating-trigger");
  });

  it("starts with a persistent Assistant composer inside the unified dock", async () => {
    const shell = await readRepository(
      "apps/morro-digital-platform/src/layouts/app-shell.ts",
    );

    const composerStart = shell.indexOf('id="assistant-input-area"');
    const composerEnd = shell.indexOf("</div>", composerStart);
    const composer = shell.slice(composerStart, composerEnd);

    expect(shell).toContain("composeUnifiedAssistantDock");
    expect(shell).toContain('id = "unified-assistant-dock"');
    expect(composer).toContain("is-persistent");
    expect(composer).toContain("is-voice-first");
    expect(composer).toContain('data-home-assistant-entry="persistent"');
    expect(composer).toContain('data-assistant-entry-mode="voice-first"');
    expect(composer).toContain('id="assistantInput"');
    expect(composer).toContain("md-assistant-compat-input");
    expect(composer).toContain('id="sendButton"');
    expect(composer).toContain("md-assistant-compat-send");
    expect(composer).toContain('id="voiceButton"');
    expect(composer).toContain("md-assistant-voice-cta");
    expect(composer).toContain(">Fale comigo</span>");
    expect(composer).not.toContain(
      'placeholder="Pergunte ao Morro Digital..."',
    );
    expect(composer).not.toContain('id="configButton"');
    expect(shell.indexOf('id="configButton"')).toBeGreaterThan(composerEnd);
  });

  it("routes Home navigation through existing product capabilities", async () => {
    const controller = await readRepository(
      "apps/morro-digital-platform/src/home/home-discover-navigation.ts",
    );

    expect(controller).toContain('"morro:explore-reset-requested"');
    expect(controller).toContain('"morro:assistant-open-request"');
    expect(controller).toContain('"morro:assistant-option-selected"');
    expect(controller).toContain(
      'value: action === "tours" ? "tours" : "favorites"',
    );
    expect(controller).toContain("openPrivacyPreferences()");
    expect(controller).not.toContain("profile.html");
    expect(controller).not.toContain("saved.html");
  });

  it("localizes the new Home chrome in PT-BR, EN, ES and HE", async () => {
    const controller = await readRepository(
      "apps/morro-digital-platform/src/home/home-discover-navigation.ts",
    );

    for (const locale of ["pt:", "en:", "es:", "he:"]) {
      expect(controller).toContain(locale);
    }
    expect(controller).toContain("document.documentElement.lang");
    expect(controller).toContain('value.startsWith("he")');
  });

  it("integrates privacy into Settings without removing LGPD choice", async () => {
    const [css, analytics] = await Promise.all([
      readRepository("apps/morro-digital-platform/public/tourist-shell-v2.css"),
      readRepository(
        "apps/morro-digital-platform/src/analytics/browser-analytics.ts",
      ),
    ]);

    expect(css).toMatch(
      /body\[data-md-mode="discover"\]\s+\.analytics-consent-preferences\.is-collapsed\s*\{[^}]*display:\s*none/isu,
    );
    expect(analytics).toContain("installBrowserAnalyticsConsentPreferences");
    expect(analytics).toContain('role", "dialog"');
    expect(analytics).toContain(
      'applyBrowserAnalyticsConsentChoice(controller, "denied")',
    );
    expect(analytics).toContain(
      'applyBrowserAnalyticsConsentChoice(controller, "granted")',
    );
  });

  it("reserves safe-area space for bottom navigation, Assistant and map controls", async () => {
    const css = await readRepository(
      "apps/morro-digital-platform/public/tourist-shell-v2.css",
    );

    expect(css).toContain("--md-home-bottom-nav-height");
    expect(css).toContain("#home-bottom-navigation.md-home-bottom-nav");
    expect(css).toContain(
      "#assistant-input-area.md-assistant-composer.is-compact",
    );
    expect(css).toContain("#globe-map-control.md-map-control-stack");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(
      "@media (max-height: 34rem) and (orientation: landscape)",
    );
    expect(css).not.toContain("transition: all");
  });

  it("pins Wave A Discover camera, POIs, chips and recenter semantics to the Golden contract", async () => {
    const [shell, runtime, css, staging] = await Promise.all([
      readRepository("apps/morro-digital-platform/src/layouts/app-shell.ts"),
      readRepository("apps/morro-digital-platform/src/browser-entry.ts"),
      readRepository("apps/morro-digital-platform/public/tourist-shell-v2.css"),
      readRepository("render.staging.yaml"),
    ]);

    expect(shell).toContain('id="discover-category-rail"');
    for (const category of [
      "beaches",
      "restaurants",
      "hotels",
      "attractions",
      "nightlife",
    ]) {
      expect(shell).toContain(`data-discover-category="${category}"`);
    }
    expect(shell).toContain('id="recenter-map-control"');
    expect(shell).toContain('data-map-control="user-location"');
    expect(shell).toContain("Minha localização");
    expect(runtime).toContain('setText("Você está aqui")');
    expect(css).toContain(
      '#globe-map-control [data-map-control="user-location"]',
    );
    expect(css).toContain('#globe-map-control [data-map-control="3d"]');
    expect(runtime).toContain("const DISCOVER_HOME_ZOOM = 14.8");
    expect(runtime).toContain("discoverInitialMarkers()");
    expect(runtime).toContain('"data-discover-poi-count"');
    expect(runtime).toContain('"data-geolocation-state"');
    expect(runtime).toContain("installDiscoverRecenterControl");
    expect(css).toContain("UX Design V2 Wave A — Golden Discover convergence");
    expect(css).toContain(".md-discover-category-rail");
    expect(css).toContain("z-index: var(--md-layer-map-control);");
    expect(css).toContain('.morro-explore-marker[data-selected="true"]');
    expect(staging).toContain("mapbox://styles/mapbox/satellite-streets-v12");
    expect(staging).toContain('value: "14.8"');
  });

  it("preserves Wave H map, Weather and map-perspective target selectors", async () => {
    const onboarding = await readRepository(
      "apps/morro-digital-platform/src/onboarding/public-interactive-tour.ts",
    );

    expect(onboarding).toContain(
      'Object.freeze({ selectors: ["#map-container", "#map"] })',
    );
    expect(onboarding).toContain(
      'Object.freeze({ selectors: ["#weather-widget"] })',
    );
    expect(onboarding).toContain(
      'Object.freeze({ selectors: ["#toggle-globe-view"] })',
    );
  });
});
