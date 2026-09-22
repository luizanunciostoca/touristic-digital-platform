import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const publicRoot = fileURLToPath(new URL("../../public/", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readPublic(name: string): Promise<string> {
  return readFile(`${publicRoot}${name}`, "utf8");
}

async function readRepository(path: string): Promise<string> {
  return readFile(`${repositoryRoot}${path}`, "utf8");
}

describe("UX Design V2 Wave D tour contract", () => {
  it("keeps Tours discovery map-first with compact horizontally scrollable filters", async () => {
    const css = await readPublic("explore-locations.css");

    expect(css).toContain(
      '.explore-flow-sheet-source[data-category="tours"][data-stage="filters"]',
    );
    expect(css).toContain("max-height: min(29dvh, 15rem)");
    expect(css).toContain("overflow-x: auto");
    expect(css).toContain("white-space: nowrap");
    expect(css).toContain("text-overflow: ellipsis");
  });

  it("clusters dense Tour discovery markers without changing the global map provider", async () => {
    const [control, marker, browser] = await Promise.all([
      readRepository(
        "apps/morro-digital-platform/src/map/explore-locations-control.ts",
      ),
      readRepository(
        "apps/morro-digital-platform/src/map/explore-marker-element.ts",
      ),
      readRepository("apps/morro-digital-platform/src/browser-entry.ts"),
    ]);

    expect(control).toContain("clusterTourDiscoveryMarkers");
    expect(control).toContain(
      'category === "tours" && activeStage === "filters"',
    );
    expect(control).toContain("TOUR_DISCOVERY_CLUSTER_RADIUS_DEGREES");
    expect(marker).toContain('root.dataset.tourCluster = "true"');
    expect(marker).toContain(
      'root.dataset.clusterCount = String(clusterCount)',
    );
    expect(marker).toContain('root.dataset.clusterLabel = input.label');
    expect(marker).toContain('else root.dataset.locationName = input.label');
    expect(browser).not.toContain("clusterTourDiscoveryMarkers");
  });

  it("keeps labels collision-safe and Tour discovery markers keyboard reachable", async () => {
    const [css, marker] = await Promise.all([
      readPublic("explore-locations.css"),
      readRepository(
        "apps/morro-digital-platform/src/map/explore-marker-element.ts",
      ),
    ]);

    expect(css).toContain(".morro-explore-marker-label");
    expect(css).toContain(
      ".morro-explore-marker:is(:hover, :focus, :focus-visible)",
    );
    expect(marker).toContain('if (category === "tours") root.tabIndex = 0');
  });

  it("separates preview from a real active stop state and exposes compact x/y progress", async () => {
    const controller = await readRepository(
      "apps/morro-digital-platform/src/map/immersive-tour-v1-controller.ts",
    );

    expect(controller).toContain('"tour-intro-card"');
    expect(controller).toContain('"tour-stop-card"');
    expect(controller).toContain('"tour-active-header"');
    expect(controller).toContain('"tour-active-thumb"');
    expect(controller).toContain('"tour-active-count"');
    expect(controller).toContain('"tour-stop-progress-segments"');
    expect(controller).toContain('"tour-stop-progress-segment"');
    expect(controller).toContain("`${current}/${tour.stops.length}`");
    expect(controller).toContain(
      'card.dataset.stopIndex = String(state.currentStopIndex)',
    );
    expect(controller).toContain(
      'card.dataset.totalStops = String(tour.stops.length)',
    );
  });

  it("preserves missing-image recovery and first/last/completion controls", async () => {
    const controller = await readRepository(
      "apps/morro-digital-platform/src/map/immersive-tour-v1-controller.ts",
    );

    expect(controller).toContain(
      'card.dataset.photoState = stop.photoPath ? "available" : "missing"',
    );
    expect(controller).toContain('card.dataset.photoState = "missing"');
    expect(controller).toContain("photoWrap.hidden = true");
    expect(controller).toContain("TOUR_PREVIOUS");
    expect(controller).toContain("TOUR_NEXT");
    expect(controller).toContain("TOUR_FINISH");
    expect(controller).toContain('"tour-finale-card"');
  });

  it("keeps every Active Tour marker numbered and visually distinguishes the selected stop", async () => {
    const [browser, css] = await Promise.all([
      readRepository("apps/morro-digital-platform/src/browser-entry.ts"),
      readPublic("explore-locations.css"),
    ]);

    expect(browser).toContain("number.textContent = String(stop.order)");
    expect(css).toContain(".tour-stop-pin.tour-stop-active");
    expect(css).toContain("scale(1.16)");
  });

  it("keeps the Active Tour map visible while de-emphasizing See all stops", async () => {
    const css = await readPublic("explore-locations.css");

    expect(css).toContain("max-height: min(43dvh, 26rem)");
    expect(css).toContain(
      '.explore-flow-sheet-option[data-value="__tour_list__"]',
    );
    expect(css).toContain('body:has(#map[data-tour-flow-stage="stop"])');
    expect(css).toContain("display: none");
  });
});
