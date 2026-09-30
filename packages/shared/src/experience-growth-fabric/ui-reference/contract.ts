export type GrowthUiSurfaceId =
  | "morro-pass"
  | "journey"
  | "missions"
  | "rewards"
  | "affiliate-growth"
  | "campaign-placements"
  | "growth-control"
  | "risk-console"
  | "experiment-console";

export interface GrowthUiSurfaceContract {
  readonly id: GrowthUiSurfaceId;
  readonly label: string;
  readonly audience: "traveler" | "affiliate" | "operator";
  readonly minimumTouchTargetPx: 44;
  readonly keyboardReachable: true;
  readonly localeAware: true;
  readonly runtimeMounted: false;
  readonly reads: readonly string[];
  readonly writes: readonly string[];
}

export const GROWTH_UI_SURFACES = [
  {
    id: "morro-pass",
    label: "Morro Pass",
    audience: "traveler",
    minimumTouchTargetPx: 44,
    keyboardReachable: true,
    localeAware: true,
    runtimeMounted: false,
    reads: ["journey", "engagement-profile", "next-best-actions"],
    writes: [],
  },
  {
    id: "journey",
    label: "Minha Jornada",
    audience: "traveler",
    minimumTouchTargetPx: 44,
    keyboardReachable: true,
    localeAware: true,
    runtimeMounted: false,
    reads: ["journey", "mission-progress"],
    writes: [],
  },
  {
    id: "missions",
    label: "Missões",
    audience: "traveler",
    minimumTouchTargetPx: 44,
    keyboardReachable: true,
    localeAware: true,
    runtimeMounted: false,
    reads: ["mission-definitions", "mission-progress"],
    writes: [],
  },
  {
    id: "rewards",
    label: "Recompensas",
    audience: "traveler",
    minimumTouchTargetPx: 44,
    keyboardReachable: true,
    localeAware: true,
    runtimeMounted: false,
    reads: ["reward-entitlements", "reward-inventory"],
    writes: ["reward-redemption-intent"],
  },
  {
    id: "affiliate-growth",
    label: "Crescimento do Afiliado",
    audience: "affiliate",
    minimumTouchTargetPx: 44,
    keyboardReachable: true,
    localeAware: true,
    runtimeMounted: false,
    reads: ["affiliate-quality", "affiliate-xp", "affiliate-level"],
    writes: [],
  },
  {
    id: "campaign-placements",
    label: "Campanhas e Placements",
    audience: "affiliate",
    minimumTouchTargetPx: 44,
    keyboardReachable: true,
    localeAware: true,
    runtimeMounted: false,
    reads: ["campaigns", "placements"],
    writes: ["placement-management-intent"],
  },
  {
    id: "growth-control",
    label: "Growth Control Plane",
    audience: "operator",
    minimumTouchTargetPx: 44,
    keyboardReachable: true,
    localeAware: true,
    runtimeMounted: false,
    reads: ["growth-read-models"],
    writes: [],
  },
  {
    id: "risk-console",
    label: "Risk Console",
    audience: "operator",
    minimumTouchTargetPx: 44,
    keyboardReachable: true,
    localeAware: true,
    runtimeMounted: false,
    reads: ["risk-signals", "risk-decisions"],
    writes: [],
  },
  {
    id: "experiment-console",
    label: "Experiment Console",
    audience: "operator",
    minimumTouchTargetPx: 44,
    keyboardReachable: true,
    localeAware: true,
    runtimeMounted: false,
    reads: ["experiments", "experiment-outcomes"],
    writes: [],
  },
] as const satisfies readonly GrowthUiSurfaceContract[];

export function validateGrowthUiSurfaces(
  surfaces: readonly GrowthUiSurfaceContract[],
): readonly GrowthUiSurfaceContract[] {
  const ids = new Set<string>();

  for (const surface of surfaces) {
    if (ids.has(surface.id)) throw new Error("GROWTH_UI_SURFACE_DUPLICATE");
    if (surface.minimumTouchTargetPx < 44) {
      throw new Error("GROWTH_UI_TOUCH_TARGET_TOO_SMALL");
    }
    if (
      surface.keyboardReachable !== true ||
      surface.localeAware !== true ||
      surface.runtimeMounted !== false
    ) {
      throw new Error("GROWTH_UI_ACCESSIBILITY_OR_ISOLATION_INVALID");
    }
    ids.add(surface.id);
  }

  return surfaces;
}
