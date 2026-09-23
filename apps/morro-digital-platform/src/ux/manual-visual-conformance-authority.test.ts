import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

type Surface = Readonly<{
  status: string;
  canonicalState?: string;
  proofObligations: readonly string[];
}>;

type ManualAuthority = Readonly<{
  version: number;
  authority: Readonly<{
    document: string;
    section: string;
    appendix: string;
    principle: string;
  }>;
  productDecisions: Readonly<{
    quickActions: string;
    floatingAssistantLauncher: string;
    mapAsDominantCanvas: boolean;
  }>;
  surfaces: Readonly<Record<string, Surface>>;
  certification: Readonly<{
    forbiddenWhileAnyStatusMatches: readonly string[];
    forbiddenGateStatuses: readonly string[];
    physicalGate: string;
    gates: Readonly<{
      exactMain: Readonly<{ status: string; requirement: string }>;
      stagingExactSha: Readonly<{ status: string; requirement: string }>;
      canonicalIssue33: Readonly<{ status: string; requirement: string }>;
      samsungPhysical: Readonly<{ status: string; requirement: string }>;
    }>;
  }>;
}>;

const root = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(root + path, "utf8");
}

async function readAuthority(): Promise<ManualAuthority> {
  return JSON.parse(
    await readRepository(
      "tests/visual-regression/ux-v2-manual-conformance.json",
    ),
  ) as ManualAuthority;
}

describe("UX V2 manual visual conformance authority", () => {
  it("makes Appendix A, not implementation self-regression, the declared authority", async () => {
    const authority = await readAuthority();

    expect(authority.version).toBe(1);
    expect(authority.authority.document).toBe(
      "Morro_Digital_Manual_Desenvolvedor_UX_Design_V2.pdf",
    );
    expect(authority.authority.appendix).toBe("A");
    expect(authority.authority.principle).toContain(
      "never the visual authority",
    );
    expect(authority.productDecisions).toEqual({
      quickActions: "retired",
      floatingAssistantLauncher: "retired",
      mapAsDominantCanvas: true,
    });
  });

  it("keeps every manual reference surface attached to explicit proof obligations", async () => {
    const authority = await readAuthority();
    const required = [
      "discover",
      "place",
      "searchExplore",
      "navigation",
      "tour",
      "assistant",
      "commerce",
      "ticketing",
    ];

    expect(Object.keys(authority.surfaces).sort()).toEqual(required.sort());
    for (const surface of Object.values(authority.surfaces)) {
      expect(surface.status.trim().length).toBeGreaterThan(0);
      expect(surface.proofObligations.length).toBeGreaterThan(0);
      for (const obligation of surface.proofObligations) {
        expect(obligation.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("separates surface conformance from release certification gates", async () => {
    const authority = await readAuthority();
    const forbidden = new Set(
      authority.certification.forbiddenWhileAnyStatusMatches,
    );
    const blocking = Object.values(authority.surfaces).filter((surface) =>
      forbidden.has(surface.status),
    );
    const forbiddenGateStatuses = new Set(
      authority.certification.forbiddenGateStatuses,
    );
    const gateBlocking = Object.values(authority.certification.gates).filter(
      (gate) => forbiddenGateStatuses.has(gate.status),
    );

    expect(blocking).toHaveLength(0);
    expect(
      Object.values(authority.surfaces).every(
        (surface) => surface.status === "MANUAL_CONFORMANCE_PASS",
      ),
    ).toBe(true);
    expect(gateBlocking.length).toBeGreaterThan(0);
    expect(authority.certification.gates.exactMain.status).toBe("PENDING");
    expect(authority.certification.gates.stagingExactSha.status).toBe(
      "PENDING",
    );
    expect(authority.certification.gates.samsungPhysical.status).toBe(
      "PENDING",
    );
    expect(authority.certification.physicalGate).toContain("SM-X820");
  });

  it("locks the Place/Search visual harness to manual-state evidence instead of a false green", async () => {
    const workflow = await readRepository(
      ".github/workflows/place-explore-v2-visual-regression.yml",
    );

    const initialCapture = workflow.indexOf("place-initial-${viewport.id}.png");
    const stateCycle = workflow.indexOf("const stateSequence = [");
    const expandedCapture = workflow.indexOf("place-full-${viewport.id}.png");

    expect(initialCapture).toBeGreaterThan(-1);
    expect(stateCycle).toBeGreaterThan(initialCapture);
    expect(expandedCapture).toBeGreaterThan(stateCycle);
    expect(workflow).toContain("MANUAL_CONFORMANCE_PLACE_INITIAL_GEOMETRY");
    expect(workflow).toContain(
      "initialPlaceGeometry.rect.height > viewport.height * 0.5",
    );
    expect(workflow).toContain(
      "initialPlaceGeometry.rect.height < viewport.height * 0.28",
    );
    expect(workflow).toContain("MANUAL_CONFORMANCE_SEARCH_RESULT_GEOMETRY");
    expect(workflow).toContain(
      '#assistant-category-rail[data-rail-stage="places"]',
    );
    expect(workflow).toContain("resultGeometry.width < 44");
    expect(workflow).toContain("resultGeometry.height < 44");
    expect(workflow).toContain("resultGeometry.wordBreak === 'break-all'");
  });

  it("rejects Ticketing self-regression when the purchase hierarchy is not image-led", async () => {
    const workflow = await readRepository(
      ".github/workflows/ticketing-v2-visual-regression.yml",
    );

    expect(workflow).toContain(
      "MANUAL_CONFORMANCE_TICKETING_IMAGE_LED_HIERARCHY",
    );
    expect(workflow).toContain("[data-ticketing-hero]");
    expect(workflow).toContain("[data-ticketing-experience-media]");
    expect(workflow).toContain("visibleMediaCount < 1");
  });

  it("keeps manual golden authority inside both final acceptance inventories", async () => {
    const workflow = await readRepository(
      ".github/workflows/final-release-acceptance.yml",
    );
    const matches =
      workflow.match(/ux-v2-manual-golden-conformance\.yml/gu) ?? [];

    expect(matches).toHaveLength(2);
  });

  it("captures pure Discover before route mutation", async () => {
    const workflow = await readRepository(
      ".github/workflows/mapbox-visual-contract-regression.yml",
    );
    const discoverCapture = workflow.indexOf(
      "discover-${name}-${discoverSuffix}.png",
    );
    const routeMutation = workflow.indexOf(
      "await dispatchTour(page, 'volta-a-ilha');",
    );

    expect(discoverCapture).toBeGreaterThan(-1);
    expect(routeMutation).toBeGreaterThan(discoverCapture);
  });

  it("captures successful Tour intro, stop and finale states", async () => {
    const workflow = await readRepository(
      ".github/workflows/map-tour-browser-regression.yml",
    );

    expect(workflow).toContain("tour-intro-${evidenceName}.png");
    expect(workflow).toContain("tour-stop-${evidenceName}.png");
    expect(workflow).toContain("tour-finale-${evidenceName}.png");
    expect(workflow).toContain("validateGuidedV1Flow(page, name)");
  });
});
