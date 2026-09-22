import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const publicRoot = fileURLToPath(new URL("../../public/", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readPublic(path: string): Promise<string> {
  return readFile(publicRoot + path, "utf8");
}

async function readRepository(path: string): Promise<string> {
  return readFile(repositoryRoot + path, "utf8");
}

describe("Home / Discover V2 visual shell", () => {
  it("loads the V2 shell authority after Design System V2", async () => {
    const html = await readPublic("index.html");
    const designSystem = html.indexOf(
      "/apps/morro-digital-platform/public/design-system-v2.css",
    );
    const shell = html.indexOf(
      "/apps/morro-digital-platform/public/tourist-shell-v2.css",
    );

    expect(designSystem).toBeGreaterThan(-1);
    expect(shell).toBeGreaterThan(designSystem);
  });

  it("mounts a map-first shell without retired Assistant launchers", async () => {
    const shell = await readRepository(
      "apps/morro-digital-platform/src/layouts/app-shell.ts",
    );

    expect(shell).toContain("app-shell md-viewport-shell md-tourist-shell-v2");
    expect(shell).toContain('data-home-visual-state="loading"');
    expect(shell).toContain('id="map-state-surface"');
    expect(shell).toContain("md-map-state-loading");
    expect(shell).toContain("md-map-state-unavailable");
    expect(shell).toContain(
      'id="weather-widget" class="weather-widget md-weather-control md-card"',
    );
    expect(shell).toContain(
      "assistant-input-area md-assistant-composer md-card",
    );
    expect(shell).toContain("composeUnifiedAssistantDock");
    expect(shell).toContain('dock.id = "unified-assistant-dock"');
    expect(shell).toContain("map-control-button md-icon-button md-map-control");
    expect(shell).not.toContain("weather-widget compact");
    expect(shell).not.toContain("data-compatibility-state");
    expect(shell).not.toContain("quick-actions");
    expect(shell).not.toContain("mood-button");
  });

  it("uses semantic V2 tokens for visible Home geometry", async () => {
    const css = await readPublic("tourist-shell-v2.css");

    for (const token of [
      "--md-color-surface-canvas",
      "--md-color-surface-glass",
      "--md-color-text-primary",
      "--md-color-interactive-primary",
      "--md-font-family-sans",
      "--md-touch-target-min",
      "--md-layer-map",
      "--md-layer-map-control",
      "--md-layer-dock",
      "--md-layer-dialog",
      "--md-layer-system",
      "--md-safe-top",
      "--md-safe-bottom",
      "--md-motion-duration-fast",
    ]) {
      expect(css).toContain(`var(${token}`);
    }

    expect(css).toContain(".app-shell.md-tourist-shell-v2 #map-section");
    expect(css).toContain('body[data-md-mode="discover"] .md-home-header');
    expect(css).toMatch(
      /\.md-home-header-inner\s*\{[^}]*flex-direction:\s*row/isu,
    );
    expect(css).toMatch(
      /\.md-home-title-block\s*\{[^}]*flex:\s*1 1 auto[^}]*overflow:\s*hidden/isu,
    );
    expect(css).toContain(
      'body[data-md-mode="discover"] .analytics-consent-preferences.is-collapsed',
    );
    expect(css).toContain("#weather-widget.md-weather-control");
    expect(css).toContain("#unified-assistant-dock.md-unified-assistant-dock");
    expect(css).toContain("#assistant-input-area.md-assistant-composer");
    expect(css).toContain("flex: 1 1 auto");
    expect(css).not.toMatch(/#configButton\s*\{[^}]*display:\s*none/isu);
    expect(css).toContain("#globe-map-control .md-map-control");
    expect(css).toContain(
      '.app-shell[data-home-visual-state="provider-unavailable"]',
    );
    expect(css).not.toContain("transition: all");
    expect(css).not.toContain("z-index: 1000");
    expect(css).not.toContain("z-index: 2000");
  });

  it("keeps onboarding on V2 surfaces without auto-opening the contextual Assistant", async () => {
    const [onboarding, interactiveTour] = await Promise.all([
      readRepository(
        "apps/morro-digital-platform/src/onboarding/public-onboarding.ts",
      ),
      readRepository(
        "apps/morro-digital-platform/src/onboarding/public-interactive-tour.ts",
      ),
    ]);

    expect(onboarding).not.toContain("ensureV1AssistantWelcomeVisible");
    expect(interactiveTour).not.toContain("requestAssistantOpen");
    expect(interactiveTour).not.toContain(
      'Object.freeze({ selectors: ["#assistant-messages"] })',
    );
    expect(interactiveTour).toContain(
      'Object.freeze({ selectors: ["#assistant-input-area"] })',
    );
    expect(interactiveTour).toContain(
      'Object.freeze({ selectors: ["#voiceButton", "#assistant-input-area"] })',
    );
    expect(interactiveTour).toContain(
      'Object.freeze({ selectors: ["#home-profile-button"] })',
    );
    expect(interactiveTour).toContain(
      'Object.freeze({ selectors: ["#toggle-globe-view"] })',
    );
    expect(interactiveTour).not.toContain(
      'Object.freeze({ selectors: ["#home-bottom-navigation"] })',
    );
  });

  it("renders Weather with the V2 compact control composition", async () => {
    const runtime = await readRepository(
      "apps/morro-digital-platform/src/weather/weather-widget.ts",
    );

    expect(runtime).toContain(
      "weather-compact-main md-weather-control-content",
    );
    expect(runtime).toContain('class="weather-emoji" aria-hidden="true"');
  });
});
