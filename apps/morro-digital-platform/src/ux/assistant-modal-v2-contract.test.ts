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
  it(
    "composes dialog, conversation, options and composer semantics in the real shell",
    async () => {
      const shell = await readRepository(
        "apps/morro-digital-platform/src/layouts/app-shell.ts",
      );

      for (const contract of [
        'class="assistant-modal md-assistant-dialog',
        'role="dialog"',
        'aria-modal="false"',
        'aria-describedby="assistant-dialog-status"',
        'id="assistant-dialog-status"',
        'class="messages-area md-assistant-messages"',
        'role="region"',
        'class="assistant-options md-assistant-options"',
        'role="group"',
        'class="assistant-input-area md-assistant-composer"',
        'aria-haspopup="dialog"',
      ]) {
        expect(shell, `missing ${contract}`).toContain(contract);
      }
    },
  );

  it(
    "uses semantic Design System V2 layers, motion and accessibility media contracts",
    async () => {
      const css = await readPublic("assistant-v2.css");

      expect(css).toContain("var(--md-layer-dialog)");
      expect(css).toContain("var(--md-layer-dock)");
      expect(css).toContain("var(--md-font-family-sans)");
      expect(css).toContain("var(--md-touch-target-min)");
      expect(css).toContain("var(--md-motion-duration-normal)");
      expect(css).toContain("@media (prefers-reduced-motion: reduce)");
      expect(css).toContain("@media (forced-colors: active)");
      expect(css).not.toContain("transition: all");
      expect(css).not.toMatch(/z-index:\s*\d{3,}/u);
    },
  );

  it(
    "publishes loading, success and error state from the browser runtime",
    async () => {
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
    },
  );

  it("loads and caches the V2 stylesheet after frozen legacy CSS", async () => {
    const [html, worker] = await Promise.all([
      readPublic("index.html"),
      readPublic("service-worker.js"),
    ]);
    const assistant = "/apps/morro-digital-platform/public/assistant-v2.css";
    const legacy = "/apps/morro-digital-platform/public/legacy/checkpoint.css";

    expect(html).toContain(assistant);
    expect(html.indexOf(assistant)).toBeGreaterThan(html.indexOf(legacy));
    expect(worker).toContain(assistant);
  });
});
