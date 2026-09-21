import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(`${repositoryRoot}${path}`, "utf8");
}

describe("UX Design V2 shared component adoption", () => {
  it("keeps the canonical primitive set in the Design System", async () => {
    const css = await readRepository(
      "apps/morro-digital-platform/public/design-system-v2.css",
    );

    for (const primitive of [
      ".md-button",
      ".md-icon-button",
      ".md-input",
      ".md-card",
      ".md-dialog",
      ".md-bottom-sheet",
      ".md-banner",
      ".md-toast",
      ".md-skeleton",
    ]) {
      expect(css).toContain(primitive);
    }
  });

  it("uses shared button primitives in the real Home Navigation and Assistant shell", async () => {
    const shell = await readRepository(
      "apps/morro-digital-platform/src/layouts/app-shell.ts",
    );

    expect(shell).toContain("map-control-button md-icon-button");
    expect(shell).toContain("mood-button md-icon-button");
    expect(shell).toContain("minimize-button md-icon-button");
    expect(shell).toContain(
      "end-navigation-btn md-button md-button--destructive",
    );
    expect(shell).toContain('id="sendButton" class="md-icon-button"');
  });

  it("uses the same shared icon-button primitive for runtime-created 3D controls", async () => {
    const map = await readRepository(
      "apps/morro-digital-platform/src/map/three-dimensional-map-control.ts",
    );

    expect(map).toContain(
      'button.className = "map-control-button md-icon-button"',
    );
  });

  it("adopts shared banner and toast primitives in real tourist feedback surfaces", async () => {
    const [shell, onboarding, premium] = await Promise.all([
      readRepository("apps/morro-digital-platform/src/layouts/app-shell.ts"),
      readRepository(
        "apps/morro-digital-platform/src/onboarding/public-interactive-tour.ts",
      ),
      readRepository("apps/morro-digital-platform/public/premium-ux-v2.css"),
    ]);

    expect(shell).toContain(
      'class="instruction-banner md-banner md-navigation-banner hidden"',
    );
    expect(premium).toContain("padding: 0;");
    expect(onboarding).toContain('toast.className = "md-toast"');
    expect(onboarding).toContain('toast.setAttribute("role", "status")');
    expect(onboarding).toContain('toast.setAttribute("aria-live", "polite")');
    expect(premium).toContain("#tour-finish-toast.md-toast");
    expect(premium).toContain("var(--md-layer-toast)");
    expect(premium).toContain("var(--md-motion-duration-slow)");
    expect(premium).not.toContain("transition: all");
  });

  it("retains shared components across Commerce and Ticketing", async () => {
    const [experience, tickets] = await Promise.all([
      readRepository("apps/morro-digital-platform/public/experience.html"),
      readRepository("apps/morro-digital-platform/public/tickets.html"),
    ]);

    expect(experience).toContain("md-card");
    expect(experience).toContain("md-button md-button--primary");
    expect(experience).toContain("md-skeleton");
    expect(tickets).toContain("md-card");
    expect(tickets).toContain("md-button");
  });
});
