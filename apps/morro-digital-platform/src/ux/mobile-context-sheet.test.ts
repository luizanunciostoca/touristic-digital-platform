import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { stepMobileContextSheetState } from "./mobile-context-sheet.js";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(`${repositoryRoot}${path}`, "utf8");
}

describe("UX Design V2 mobile context sheet", () => {
  it("steps deterministically across peek half and full states", () => {
    expect(stepMobileContextSheetState("peek", "expand")).toBe("half");
    expect(stepMobileContextSheetState("half", "expand")).toBe("full");
    expect(stepMobileContextSheetState("full", "expand")).toBe("full");
    expect(stepMobileContextSheetState("full", "collapse")).toBe("half");
    expect(stepMobileContextSheetState("half", "collapse")).toBe("peek");
    expect(stepMobileContextSheetState("peek", "collapse")).toBe("peek");
  });

  it("activates the shared bottom-sheet primitive for Search Place and Tour", async () => {
    const runtime = await readRepository(
      "apps/morro-digital-platform/src/ux/mobile-context-sheet.ts",
    );

    for (const mode of ["search", "place", "tour"]) {
      expect(runtime).toContain(`"${mode}"`);
    }
    expect(runtime).toContain('"md-bottom-sheet", "md-context-sheet"');
    expect(runtime).toContain('"md-bottom-sheet-content"');
    expect(runtime).toContain('data.contextSheetState');
    expect(runtime).toContain('"ArrowUp"');
    expect(runtime).toContain('"ArrowDown"');
    expect(runtime).toContain('"Home"');
    expect(runtime).toContain('"End"');
    expect(runtime).toContain('"pointerdown"');
    expect(runtime).toContain('"touchmove"');
  });

  it("makes Search an explicit mode from live Explore filters and places stages", async () => {
    const mode = await readRepository(
      "apps/morro-digital-platform/src/ux/premium-ux-mode.ts",
    );

    expect(mode).toContain('| "search"');
    expect(mode).toContain('map?.dataset.exploreStage === "filters"');
    expect(mode).toContain('map?.dataset.exploreStage === "places"');
    expect(mode).toContain('if (signals.searchActive) return "search"');
  });

  it("installs the controller in the real browser entry and keeps Commerce on its own sheet", async () => {
    const [entry, commerce] = await Promise.all([
      readRepository("apps/morro-digital-platform/src/browser-entry.ts"),
      readRepository(
        "apps/morro-digital-platform/src/runtime/commerce-preview-sheet.ts",
      ),
    ]);

    expect(entry).toContain("installMobileContextSheet");
    expect(commerce).toContain('"md-bottom-sheet", "commerce-preview-sheet"');
  });

  it("keeps real browser evidence on Search Place and Tour flows", async () => {
    const [explore, tour] = await Promise.all([
      readRepository(
        ".github/workflows/v1-explore-locations-browser-regression.yml",
      ),
      readRepository(".github/workflows/map-tour-browser-regression.yml"),
    ]);

    expect(explore).toContain("assertMobileContextSheet");
    expect(explore).toContain("'search'");
    expect(explore).toContain("'place'");
    expect(tour).toContain("sheetMode !== 'tour'");
    expect(tour).toContain("data-context-sheet-handle");
  });
});
