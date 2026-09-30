import { describe, expect, it } from "vitest";

import { GROWTH_UI_SURFACES, validateGrowthUiSurfaces } from "./contract.js";

describe("growth UI reference contract", () => {
  it("covers all isolated reference surfaces", () => {
    const surfaces = validateGrowthUiSurfaces(GROWTH_UI_SURFACES);
    expect(surfaces.map((surface) => surface.id)).toEqual([
      "morro-pass",
      "journey",
      "missions",
      "rewards",
      "affiliate-growth",
      "campaign-placements",
      "growth-control",
      "risk-console",
      "experiment-console",
    ]);
  });

  it("keeps every surface accessible and unmounted", () => {
    expect(
      GROWTH_UI_SURFACES.every(
        (surface) =>
          surface.minimumTouchTargetPx >= 44 &&
          surface.keyboardReachable &&
          surface.localeAware &&
          surface.runtimeMounted === false,
      ),
    ).toBe(true);
  });

  it("does not expose direct monetary authority in reference UI writes", () => {
    const writeContracts = GROWTH_UI_SURFACES.flatMap(
      (surface) => surface.writes,
    );

    expect(writeContracts).not.toContain("payment");
    expect(writeContracts).not.toContain("settlement");
    expect(writeContracts).not.toContain("ledger");
    expect(writeContracts).not.toContain("commission");
  });
});
