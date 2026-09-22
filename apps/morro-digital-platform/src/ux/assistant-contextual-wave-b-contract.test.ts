import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(`${repositoryRoot}${path}`, "utf8");
}

describe("UX V2 Wave B contextual Assistant contract", () => {
  it("retires the visible Quick Actions grid while preserving internal category routing", async () => {
    const shell = await readRepository(
      "apps/morro-digital-platform/src/layouts/app-shell.ts",
    );

    expect(shell).toContain(
      'class="assistant-options md-assistant-options" data-assistant-command-source="legacy-category-routing"',
    );
    expect(shell).not.toContain('class="quick-actions');
    expect(shell).not.toContain('class="mood-button');
    expect(shell).not.toContain('data-assistant-command-source="legacy-category-routing" hidden');
  });

  it("exposes stable semantic onboarding targets for composer and microphone", async () => {
    const shell = await readRepository(
      "apps/morro-digital-platform/src/layouts/app-shell.ts",
    );

    expect(shell).toContain('data-onboarding-target="assistant-composer"');
    expect(shell).toContain('data-assistant-context-surface="map"');
    expect(shell).toContain('data-onboarding-target="assistant-microphone"');
    expect(shell).toContain('data-assistant-voice-affordance="microphone"');
    expect(shell).toContain('id="sendButton"');
    expect(shell).toContain('id="voiceButton"');
  });

  it("keeps map-first geometry keyboard-safe and supports long responses", async () => {
    const css = await readRepository(
      "apps/morro-digital-platform/public/assistant-v2.css",
    );

    expect(css).toContain("overflow-y: auto");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain("env(safe-area-inset-bottom, 0rem)");
    expect(css).toContain("@media (max-width: 24.375rem)");
    expect(css).toContain("@media (max-height: 34rem)");
    expect(css).toContain(":focus-within");
  });

  it("keeps real responding and error states in the Assistant lifecycle", async () => {
    const [runtime, shellUi] = await Promise.all([
      readRepository(
        "apps/morro-digital-platform/src/assistant/browser-assistant-runtime.ts",
      ),
      readRepository(
        "apps/morro-digital-platform/src/assistant/assistant-shell-ui.ts",
      ),
    ]);

    expect(runtime).toContain(
      'dispatchAssistantUiState(options.document, "loading")',
    );
    expect(runtime).toContain(
      'dispatchAssistantUiState(options.document, "error")',
    );
    expect(runtime).toContain('"success"');
    expect(shellUi).toContain(
      'assistant.setAttribute("data-assistant-state", state)',
    );
    expect(shellUi).toContain('assistant.setAttribute("aria-busy"');
  });

  it("keeps the Assistant contextual rather than duplicating global navigation", async () => {
    const shell = await readRepository(
      "apps/morro-digital-platform/src/layouts/app-shell.ts",
    );

    const assistantStart = shell.indexOf('id="assistant-messages"');
    const assistantEnd = shell.indexOf('id="carousel-modal"', assistantStart);
    const assistantMarkup = shell.slice(assistantStart, assistantEnd);

    expect(assistantMarkup).not.toContain("home-bottom-navigation");
    expect(assistantMarkup).not.toContain("data-home-nav-action");
    expect(shell).toContain('data-assistant-context-surface="map"');
  });
});
