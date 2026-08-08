import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

type ValidationMode =
  "pixel-exact" | "visual-contract" | "behavioral-equivalence";

interface ScenarioResult {
  readonly decision: string;
  readonly owner: string;
  readonly trackerStatus: string;
  readonly validationMode: ValidationMode;
  readonly evidence: string;
}

interface VisualRegressionManifest {
  readonly version: number;
  readonly destinationId: string;
  readonly sourceOfTruth: {
    readonly v1Repository: string;
    readonly v1Commit: string;
    readonly v2App: string;
  };
  readonly validationPolicy: {
    readonly pixelExact: {
      readonly pixelRatio: number;
      readonly maxDifferentPixels: number;
      readonly appliesWhen: string;
    };
    readonly visualContract: {
      readonly appliesWhen: string;
      readonly requires: readonly string[];
    };
    readonly behavioralEquivalence: {
      readonly appliesWhen: string;
      readonly requires: readonly string[];
    };
  };
  readonly viewports: ReadonlyArray<{
    readonly id: string;
    readonly width: number;
    readonly height: number;
  }>;
  readonly scenarios: readonly string[];
  readonly scenarioResults: Readonly<Record<string, ScenarioResult>>;
  readonly journeys: ReadonlyArray<{
    readonly id: string;
    readonly route: string;
    readonly featureId: string;
    readonly migrationId: string;
    readonly status: string;
    readonly blockers: readonly string[];
    readonly pixelExactThreshold: {
      readonly pixelRatio: number;
      readonly maxDifferentPixels: number;
      readonly scope: string;
    };
    readonly evidence: {
      readonly allowedValidationModes: readonly ValidationMode[];
      readonly requiredCommonFields: readonly string[];
      readonly allowedDecisions: readonly string[];
      readonly allowedTrackerStatuses: readonly string[];
    };
  }>;
}

const manifestPath = fileURLToPath(
  new URL("../../../../tests/visual-regression/manifest.json", import.meta.url),
);

const REQUIRED_VIEWPORTS = ["mobile", "tablet", "desktop"] as const;
const REQUIRED_SCENARIOS = [
  "loading",
  "map-ready",
  "map-failure",
  "tour-switch",
  "tour-5-stops",
  "tour-8-stops",
  "keyboard-navigation",
  "high-contrast",
  "enlarged-text",
  "offline-provider-unavailable",
] as const;
const VALIDATION_MODES = [
  "pixel-exact",
  "visual-contract",
  "behavioral-equivalence",
] as const;
const REQUIRED_COMMON_EVIDENCE_FIELDS = [
  "decision",
  "owner",
  "trackerStatus",
] as const;

async function readManifest(): Promise<VisualRegressionManifest> {
  return JSON.parse(
    await readFile(manifestPath, "utf8"),
  ) as VisualRegressionManifest;
}

describe("V1 × V2 visual regression manifest", () => {
  it("pins the audited V1 source and preserves zero-difference for deterministic states", async () => {
    const manifest = await readManifest();
    const home = manifest.journeys.find((journey) => journey.id === "home");

    expect(manifest.version).toBe(4);
    expect(manifest.sourceOfTruth.v1Commit).toBe(
      "60746fd7fed97b805758b37adfdbe3bad2582bfe",
    );
    expect(manifest.validationPolicy.pixelExact).toMatchObject({
      pixelRatio: 0,
      maxDifferentPixels: 0,
    });
    expect(home?.pixelExactThreshold).toEqual({
      pixelRatio: 0,
      maxDifferentPixels: 0,
      scope: "deterministic scenarios only",
    });
  });

  it("covers all mandatory viewports and visual states", async () => {
    const manifest = await readManifest();

    expect(manifest.viewports.map(({ id }) => id).sort()).toEqual(
      [...REQUIRED_VIEWPORTS].sort(),
    );
    expect([...manifest.scenarios].sort()).toEqual(
      [...REQUIRED_SCENARIOS].sort(),
    );
    expect(Object.keys(manifest.scenarioResults).sort()).toEqual(
      [...REQUIRED_SCENARIOS].sort(),
    );
  });

  it("requires every mandatory scenario to be proven equivalent with an explicit validation mode and owner", async () => {
    const manifest = await readManifest();

    for (const scenario of REQUIRED_SCENARIOS) {
      const result = manifest.scenarioResults[scenario];
      expect(result).toBeDefined();
      expect(result?.decision).toBe("preserve");
      expect(result?.owner).toBe("morro-digital-platform");
      expect(result?.trackerStatus).toBe("equivalent");
      expect(VALIDATION_MODES).toContain(result?.validationMode);
      expect(result?.evidence.trim().length).toBeGreaterThan(0);
    }

    expect(manifest.scenarioResults.loading?.validationMode).toBe(
      "pixel-exact",
    );
    expect(manifest.scenarioResults["map-ready"]?.validationMode).toBe(
      "visual-contract",
    );
    expect(manifest.scenarioResults["map-failure"]?.validationMode).toBe(
      "behavioral-equivalence",
    );
    expect(
      manifest.scenarioResults["keyboard-navigation"]?.validationMode,
    ).toBe("visual-contract");
    expect(manifest.scenarioResults["high-contrast"]?.validationMode).toBe(
      "visual-contract",
    );
  });

  it("keeps pixel-exact strict without applying it to external dynamic raster", async () => {
    const manifest = await readManifest();

    expect(manifest.validationPolicy.pixelExact.appliesWhen).toContain(
      "deterministic",
    );
    expect(manifest.validationPolicy.visualContract.appliesWhen).toContain(
      "third-party renderer",
    );
    expect(manifest.validationPolicy.visualContract.requires).toContain(
      "authenticated browser execution",
    );
    expect(manifest.validationPolicy.behavioralEquivalence.requires).toContain(
      "fallback or recovery assertions",
    );
  });

  it("promotes the home journey only when every scenario is equivalent", async () => {
    const manifest = await readManifest();
    const home = manifest.journeys.find((journey) => journey.id === "home");
    const everyScenarioEquivalent = Object.values(
      manifest.scenarioResults,
    ).every((result) => result.trackerStatus === "equivalent");

    expect(everyScenarioEquivalent).toBe(true);
    expect(home?.status).toBe("equivalent");
    expect(home?.blockers).toEqual([]);
    expect(home?.evidence.allowedValidationModes).toEqual(VALIDATION_MODES);
    expect(home?.evidence.requiredCommonFields).toEqual(
      REQUIRED_COMMON_EVIDENCE_FIELDS,
    );
    expect(home?.evidence.allowedDecisions).toEqual([
      "preserve",
      "fix",
      "improve",
    ]);
    expect(home?.evidence.allowedTrackerStatuses).toEqual([
      "migrating",
      "equivalent",
      "released",
    ]);
  });
});
