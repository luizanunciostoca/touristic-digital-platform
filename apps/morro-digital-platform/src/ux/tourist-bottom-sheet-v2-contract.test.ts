import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  cycleTouristSurfaceBottomSheetState,
  stepTouristSurfaceBottomSheetState,
} from "./tourist-surface-bottom-sheet.js";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const publicRoot = fileURLToPath(new URL("../../public/", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(`${repositoryRoot}${path}`, "utf8");
}

async function readPublic(path: string): Promise<string> {
  return readFile(`${publicRoot}${path}`, "utf8");
}

describe("Tourist Surface Bottom Sheet V2", () => {
  it("uses deterministic peek half and full snap transitions", () => {
    expect(stepTouristSurfaceBottomSheetState("peek", "expand")).toBe("half");
    expect(stepTouristSurfaceBottomSheetState("half", "expand")).toBe("full");
    expect(stepTouristSurfaceBottomSheetState("full", "expand")).toBe("full");
    expect(stepTouristSurfaceBottomSheetState("full", "collapse")).toBe("half");
    expect(stepTouristSurfaceBottomSheetState("half", "collapse")).toBe("peek");
    expect(stepTouristSurfaceBottomSheetState("peek", "collapse")).toBe("peek");

    expect(cycleTouristSurfaceBottomSheetState("peek")).toBe("half");
    expect(cycleTouristSurfaceBottomSheetState("half")).toBe("full");
    expect(cycleTouristSurfaceBottomSheetState("full")).toBe("peek");
  });

  it("maps Search Place and Tour stages to one reusable mobile controller", async () => {
    const runtime = await readRepository(
      "apps/morro-digital-platform/src/ux/tourist-surface-bottom-sheet.ts",
    );
    const entry = await readRepository(
      "apps/morro-digital-platform/src/browser-entry.ts",
    );

    expect(runtime).toContain(
      'if (stage === "filters" || stage === "places") return "search"',
    );
    expect(runtime).toContain('if (stage === "detail") return "place"');
    expect(runtime).toContain('if (stage === "tour") return "tour"');
    expect(runtime).toContain('"morro:explore-state-changed"');
    expect(runtime).toContain('input.mediaQuery ?? "(max-width: 45rem)"');
    expect(entry).toContain(
      "installTouristSurfaceBottomSheet({ document, window })",
    );
  });

  it("supports pointer touch keyboard and accessible handle operation", async () => {
    const runtime = await readRepository(
      "apps/morro-digital-platform/src/ux/tourist-surface-bottom-sheet.ts",
    );

    for (const contract of [
      'handle.setAttribute("aria-controls", assistant.id)',
      'handle.setAttribute("aria-expanded", String(state !== "peek"))',
      'handle.addEventListener("pointerdown", onPointerDown)',
      'handle.addEventListener("touchstart", onTouchStart',
      'input.document.addEventListener("touchmove", onTouchMove',
      'event.key === "ArrowUp"',
      'event.key === "ArrowDown"',
      'event.key === "Home"',
      'event.key === "End"',
    ]) {
      expect(runtime).toContain(contract);
    }
  });

  it("keeps mobile sheets safe-area aware scroll-contained and reduced-motion compatible", async () => {
    const [assistantCss, premiumCss] = await Promise.all([
      readPublic("assistant-v2.css"),
      readPublic("premium-ux-v2.css"),
    ]);

    expect(assistantCss).toContain(".md-tourist-surface-sheet");
    expect(assistantCss).toContain('data-sheet-state="peek"');
    expect(assistantCss).toContain('data-sheet-state="half"');
    expect(assistantCss).toContain('data-sheet-state="full"');
    expect(assistantCss).toContain("var(--md-safe-left)");
    expect(assistantCss).toContain("var(--md-safe-right)");
    expect(assistantCss).toContain("var(--md-safe-bottom)");
    expect(assistantCss).toContain("overscroll-behavior: contain");
    expect(assistantCss).toContain("touch-action: none");
    expect(premiumCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(premiumCss).toContain(".md-bottom-sheet");
  });

  it("keeps the Explore browser gate authoritative for mobile snap behavior", async () => {
    const workflow = await readRepository(
      ".github/workflows/v1-explore-locations-browser-regression.yml",
    );

    expect(workflow).toContain("assertTouristSheet");
    expect(workflow).toContain("Tourist Bottom Sheet V2 drifted");
    expect(workflow).toContain("data-tourist-sheet-handle");
    expect(workflow).toContain("page.keyboard.press('ArrowUp')");
    expect(workflow).toContain("page.keyboard.press('Home')");
    expect(workflow).toContain("page.mouse.down()");
    expect(workflow).toContain("page.mouse.up()");
  });

  it("keeps Commerce on its production bottom-sheet controller", async () => {
    const [runtime, commerceCss] = await Promise.all([
      readRepository(
        "apps/morro-digital-platform/src/runtime/commerce-preview-sheet.ts",
      ),
      readPublic("commerce.css"),
    ]);

    expect(runtime).toContain("installCommercePreviewSheet");
    expect(runtime).toContain('event.key === "ArrowUp"');
    expect(runtime).toContain('event.key === "ArrowDown"');
    expect(runtime).toContain('handle.addEventListener("pointerdown"');
    expect(runtime).toContain('handle.addEventListener("touchstart"');
    expect(commerceCss).toContain(".commerce-preview-sheet.md-bottom-sheet");
  });
});
