import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(`${repositoryRoot}${path}`, "utf8");
}

describe("UX Design V2 runtime mode composition", () => {
  it("defines every planned tourist presentation mode in one runtime contract", async () => {
    const presenter = await readRepository(
      "apps/morro-digital-platform/src/ux/premium-ux-mode.ts",
    );

    for (const mode of [
      "discover",
      "place",
      "navigation",
      "tour",
      "commerce",
      "assistant",
    ]) {
      expect(presenter).toContain(`"${mode}"`);
    }
    expect(presenter).toContain("resolveMorroUxMode");
    expect(presenter).toContain("body.dataset.mdMode = currentMode");
  });

  it("composes every runtime mode into the shared Premium UX stylesheet", async () => {
    const css = await readRepository(
      "apps/morro-digital-platform/public/premium-ux-v2.css",
    );

    for (const mode of [
      "place",
      "navigation",
      "tour",
      "commerce",
      "assistant",
    ]) {
      expect(css, `missing ${mode} mode surface`).toContain(
        `[data-md-mode="${mode}"]`,
      );
    }
    expect(css).toContain("[data-md-mode]");
  });

  it("marks standalone Commerce and Ticketing entrypoints with the same mode", async () => {
    for (const path of [
      "apps/morro-digital-platform/public/experience.html",
      "apps/morro-digital-platform/public/tickets.html",
    ]) {
      const html = await readRepository(path);
      expect(html).toMatch(/<body\b[^>]*data-md-mode=["']commerce["']/u);
    }
  });

  it("installs the dynamic presenter from the real browser entrypoint", async () => {
    const entry = await readRepository(
      "apps/morro-digital-platform/src/browser-entry.ts",
    );

    expect(entry).toContain("installPremiumUxModePresenter");
  });
});
