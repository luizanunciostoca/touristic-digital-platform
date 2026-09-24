import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(`${repositoryRoot}${path}`, "utf8");
}

describe("UX V2 Wave E active navigation convergence", () => {
  it("keeps the map dominant and scopes compact outdoor navigation chrome", async () => {
    const css = await readRepository(
      "apps/morro-digital-platform/public/premium-ux-v2.css",
    );

    expect(css).toContain("/* UX V2 Wave E — active navigation convergence */");
    expect(css).toContain(
      'body[data-md-mode="navigation"] #instruction-banner',
    );
    expect(css).toContain(
      'body[data-md-mode="navigation"] #navigation-summary',
    );
    expect(css).toContain(
      'body[data-md-mode="navigation"] #globe-map-control .md-map-control',
    );
    expect(css).not.toContain(
      'body[data-md-mode="navigation"] #globe-map-control #toggle-globe-view {\n  display: none !important;',
    );
    expect(css).toContain("@media (max-width: 24.375rem)");
    expect(css).toContain(
      "@media (orientation: landscape) and (max-height: 36rem)",
    );
  });

  it("uses a solid high-contrast route with current and destination markers", async () => {
    const route = await readRepository(
      "apps/morro-digital-platform/src/navigation/navigation-route-presentation.ts",
    );
    const wiring = await readRepository(
      "apps/morro-digital-platform/src/navigation/browser-navigation-wiring.ts",
    );

    expect(route).toContain('"line-color": "#1689ff"');
    expect(route).not.toContain('"line-dasharray"');
    expect(wiring).toContain("navigation-destination-marker");
    expect(wiring).toContain("navigation-user-location-marker");
  });

  it("surfaces recenter, GPS, off-route, reroute and route failure states", async () => {
    const runtime = await readRepository(
      "apps/morro-digital-platform/src/navigation/browser-navigation-runtime-install.ts",
    );
    const guidance = await readRepository(
      "apps/morro-digital-platform/src/navigation/navigation-guidance-ui.ts",
    );

    expect(guidance).toContain("NAVIGATION_RECENTER_REQUEST_EVENT");
    expect(guidance).toContain("navigation-travel-mode");
    expect(guidance).toContain('role", "status"');
    expect(runtime).toContain("NAVIGATION_GUIDANCE_MAX_ACCURACY_METERS");
    expect(runtime).toContain("getRecalculationThresholdMeters");
    expect(runtime).toContain("Fora da rota. Recalculando caminho…");
    expect(runtime).toContain("Rota atualizada.");
    expect(runtime).toContain("GPS indisponível.");
    expect(runtime).toContain("Sinal de GPS impreciso.");
    expect(runtime).toContain("Rota indisponível.");
  });

  it("keeps the unified dock and bottom navigation available while repurposing category and voice surfaces", async () => {
    const [guidance, premium, shellCss] = await Promise.all([
      readRepository(
        "apps/morro-digital-platform/src/navigation/navigation-guidance-ui.ts",
      ),
      readRepository("apps/morro-digital-platform/public/premium-ux-v2.css"),
      readRepository("apps/morro-digital-platform/public/tourist-shell-v2.css"),
    ]);

    expect(guidance).toContain('setAttribute("data-dock-mode", "navigation")');
    expect(guidance).toContain(
      'setAttribute("data-navigation-summary", "true")',
    );
    expect(guidance).toContain("updateNavigationDockSummary");
    expect(guidance).toContain('voiceButton.dataset.navigationStop = "true"');
    expect(guidance).toContain("endButton?.click()");
    expect(guidance).toContain('"recenter-map-control"');
    expect(guidance).not.toContain('"navigation-recenter-btn"');
    expect(guidance).toContain('addEventListener("click", requestRecenter, true)');
    expect(guidance).toContain('removeAttribute("data-dock-mode")');
    expect(guidance).toContain('removeAttribute("data-navigation-summary")');

    expect(premium).toContain("Navigation unified dock continuity");
    expect(premium).toContain(
      '#unified-assistant-dock[data-dock-mode="navigation"]',
    );
    expect(premium).toContain(
      '#assistant-category-rail[data-navigation-summary="true"]',
    );
    expect(premium).toContain(".md-navigation-dock-summary");
    expect(premium).toContain("#voiceButton.is-navigation-stop");
    expect(premium).toContain(
      'body[data-md-mode="navigation"] #navigation-summary',
    );
    expect(premium).toContain("display: none !important");
    expect(shellCss).not.toContain(
      'body[data-md-mode="navigation"] #home-bottom-navigation,',
    );
  });
});
