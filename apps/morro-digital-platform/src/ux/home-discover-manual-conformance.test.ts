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

  it("starts with a compact Assistant entry and keeps settings outside the composer", async () => {
    const shell = await readRepository(
      "apps/morro-digital-platform/src/layouts/app-shell.ts",
    );

    const composerStart = shell.indexOf('id="assistant-input-area"');
    const composerEnd = shell.indexOf("</div>", composerStart);
    const composer = shell.slice(composerStart, composerEnd);

    expect(composer).toContain("is-compact");
    expect(composer).toContain('id="assistantInput"');
    expect(composer).toContain('id="sendButton"');
    expect(composer).toContain('id="voiceButton"');
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
});
