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

describe("Assistant Modal V2 contract", () => {
  it("composes bounded message, composer and navigation semantics in the unified dock", async () => {
    const shell = await readRepository(
      "apps/morro-digital-platform/src/layouts/app-shell.ts",
    );

    for (const contract of [
      'class="md-assistant-dialog md-assistant-message-region hidden"',
      'role="region"',
      'aria-describedby="assistant-dialog-status"',
      'id="assistant-dialog-status"',
      'class="messages-area md-assistant-messages"',
      'class="assistant-options md-assistant-options"',
      'role="group"',
      "assistant-input-area md-assistant-composer md-card",
      "composeUnifiedAssistantDock",
      'dock.id = "unified-assistant-dock"',
      "navigation",
    ]) {
      expect(shell, `missing ${contract}`).toContain(contract);
    }

    const shellUi = await readRepository(
      "apps/morro-digital-platform/src/assistant/assistant-shell-ui.ts",
    );
    expect(shellUi).toContain(
      'input?.setAttribute("aria-controls", "assistant-messages")',
    );
    expect(shellUi).toContain(
      'input?.setAttribute("aria-expanded", String(initiallyVisible))',
    );
    expect(shell).not.toContain("grow-upward");
    expect(shell).not.toContain("auto-size");
    expect(shell).not.toContain("quick-actions");
    expect(shell).not.toContain("mood-button");
  });

  it("prevents the retired floating Assistant trigger from returning to live UX V2 runtime", async () => {
    const liveRuntimeFiles = [
      "apps/morro-digital-platform/src/layouts/app-shell.ts",
      "apps/morro-digital-platform/src/assistant/assistant-shell-ui.ts",
      "apps/morro-digital-platform/src/assistant/assistant-navigation-feedback.ts",
      "apps/morro-digital-platform/src/map/explore-locations-control.ts",
      "apps/morro-digital-platform/src/onboarding/public-interactive-tour.ts",
    ];
    const livePublicFiles = [
      "styles.css",
      "design-system-v2.css",
      "premium-ux-v2.css",
      "tourist-shell-v2.css",
    ];

    const contents = await Promise.all([
      ...liveRuntimeFiles.map((path) => readRepository(path)),
      ...livePublicFiles.map((path) => readPublic(path)),
    ]);

    for (const content of contents) {
      expect(content).not.toMatch(/\.quick-actions\b/u);
      expect(content).not.toMatch(/\.mood-button\b/u);
    }
  });

  it("uses semantic Design System V2 layers, motion and accessibility media contracts", async () => {
    const css = await readPublic("assistant-v2.css");

    expect(css).toContain("var(--md-font-family-sans)");
    expect(css).toContain("var(--md-touch-target-min)");
    expect(css).toContain("var(--md-motion-duration-normal)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).not.toContain("transition: all");
    expect(css).not.toContain("position: fixed");
    expect(css).not.toMatch(/z-index:\s*\d{3,}/u);
  });

  it("publishes loading, success and error state from the browser runtime", async () => {
    const [runtime, shellUi, state] = await Promise.all([
      readRepository(
        "apps/morro-digital-platform/src/assistant/browser-assistant-runtime.ts",
      ),
      readRepository(
        "apps/morro-digital-platform/src/assistant/assistant-shell-ui.ts",
      ),
      readRepository(
        "apps/morro-digital-platform/src/assistant/assistant-ui-state.ts",
      ),
    ]);

    expect(runtime).toContain(
      'dispatchAssistantUiState(options.document, "loading")',
    );
    expect(runtime).toContain(
      'dispatchAssistantUiState(options.document, "error")',
    );
    expect(runtime).toContain('"success"');
    expect(shellUi).toContain('assistant.setAttribute("aria-busy"');
    expect(shellUi).toContain("assistantUiStateStatus");
    expect(state).toContain("ASSISTANT_UI_STATE_EVENT");
  });

  it("loads and caches the V2 stylesheet after frozen legacy CSS", async () => {
    const [html, worker] = await Promise.all([
      readPublic("index.html"),
      readPublic("service-worker.js"),
    ]);
    const assistant = "/apps/morro-digital-platform/public/assistant-v2.css";
    const legacy =
      "/apps/morro-digital-platform/public/legacy/legacy.bundle.css";

    expect(html).toContain(assistant);
    expect(html.indexOf(assistant)).toBeGreaterThan(html.indexOf(legacy));
    expect(worker).toContain(assistant);
  });
});
