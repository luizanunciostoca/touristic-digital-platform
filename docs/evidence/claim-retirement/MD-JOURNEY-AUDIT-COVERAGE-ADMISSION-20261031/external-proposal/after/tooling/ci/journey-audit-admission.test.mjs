import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { analyzeFiles } from "./impact-analyzer.mjs";
import { matchesOwnershipPath } from "../fabric/ownership-path.mjs";
import { ordinaryPrScope } from "../fabric/ordinary-pr-policy.mjs";

const ownership = JSON.parse(
  readFileSync(new URL("../../.morro/ownership.json", import.meta.url), "utf8"),
);
const risk = JSON.parse(
  readFileSync(
    new URL("../../.morro/risk-policy.json", import.meta.url),
    "utf8",
  ),
);
const ownerAdditions = {
  map: [
    "packages/assistant/src/intent-engine.ts",
    "packages/assistant/src/intent-engine.more-info-i18n.test.ts",
    "packages/assistant/src/dialog-controller.test.ts",
    "packages/assistant/src/dialog-controller.ts",
    "packages/assistant/src/dialog-controller.presentation-language.test.ts",
    "apps/morro-digital-platform/src/assistant/assistant-domain-adapter.ts",
    "apps/morro-digital-platform/src/assistant/assistant-domain-adapter.test.ts",
    "apps/morro-digital-platform/src/assistant/assistant-weather-copy.ts",
    "apps/morro-digital-platform/src/assistant/assistant-weather-copy.test.ts",
    "apps/morro-digital-platform/src/config/tour-catalog.ts",
    "apps/morro-digital-platform/src/config/tour-catalog.test.ts",
    "apps/morro-digital-platform/src/runtime/shell-v1-i18n.ts",
    "apps/morro-digital-platform/src/runtime/shell-v1-i18n.test.ts",
  ],
  auth: [
    "apps/morro-digital-platform/tooling/auth-api.mjs",
    "apps/morro-digital-platform/tooling/auth-api-logout.test.mjs",
  ],
  ticketing: [
    "apps/morro-digital-platform/tooling/ticketing-operator-authorization.test.mjs",
  ],
};
const cases = [
  {
    path: "packages/assistant/src/intent-engine.ts",
    domain: "assistant-conversation",
    risk: "MEDIUM",
    suites: [
      "assistant-conversation-continuity-browser-contract.yml",
      "assistant-input-menu-flow-v1-parity.yml",
    ],
  },
  {
    path: "packages/assistant/src/intent-engine.more-info-i18n.test.ts",
    domain: "assistant-conversation",
    risk: "MEDIUM",
    suites: [
      "assistant-conversation-continuity-browser-contract.yml",
      "assistant-input-menu-flow-v1-parity.yml",
    ],
  },
  {
    path: "packages/assistant/src/dialog-controller.test.ts",
    domain: "assistant-conversation",
    risk: "MEDIUM",
    suites: [
      "assistant-conversation-continuity-browser-contract.yml",
      "assistant-input-menu-flow-v1-parity.yml",
    ],
  },
  {
    path: "packages/assistant/src/dialog-controller.ts",
    domain: "assistant-conversation",
    risk: "MEDIUM",
    suites: [
      "assistant-conversation-continuity-browser-contract.yml",
      "assistant-input-menu-flow-v1-parity.yml",
    ],
  },
  {
    path: "packages/assistant/src/dialog-controller.presentation-language.test.ts",
    domain: "assistant-conversation",
    risk: "MEDIUM",
    suites: [
      "assistant-conversation-continuity-browser-contract.yml",
      "assistant-input-menu-flow-v1-parity.yml",
    ],
  },
  {
    path: "apps/morro-digital-platform/src/assistant/assistant-domain-adapter.ts",
    domain: "weather-ui",
    risk: "HIGH",
    suites: [
      "weather-v1-i18n-browser-parity.yml",
      "assistant-conversation-continuity-browser-contract.yml",
    ],
  },
  {
    path: "apps/morro-digital-platform/src/assistant/assistant-domain-adapter.test.ts",
    domain: "weather-ui",
    risk: "HIGH",
    suites: [
      "weather-v1-i18n-browser-parity.yml",
      "assistant-conversation-continuity-browser-contract.yml",
    ],
  },
  {
    path: "apps/morro-digital-platform/src/assistant/assistant-weather-copy.ts",
    domain: "weather-ui",
    risk: "HIGH",
    suites: ["weather-v1-i18n-browser-parity.yml"],
  },
  {
    path: "apps/morro-digital-platform/src/assistant/assistant-weather-copy.test.ts",
    domain: "weather-ui",
    risk: "HIGH",
    suites: ["weather-v1-i18n-browser-parity.yml"],
  },
  {
    path: "apps/morro-digital-platform/src/config/tour-catalog.ts",
    domain: "public-tour-catalog",
    risk: "HIGH",
    suites: [
      "map-tour-browser-regression.yml",
      "v1-tour-responsive-browser-regression.yml",
    ],
  },
  {
    path: "apps/morro-digital-platform/src/config/tour-catalog.test.ts",
    domain: "public-tour-catalog",
    risk: "HIGH",
    suites: [
      "map-tour-browser-regression.yml",
      "v1-tour-responsive-browser-regression.yml",
    ],
  },
  {
    path: "apps/morro-digital-platform/src/map/three-dimensional-map-control.ts",
    domain: "discover-controls-and-filter-labels",
    risk: "HIGH",
    suites: ["home-discover-manual-conformance.yml"],
  },
  {
    path: "apps/morro-digital-platform/src/map/three-dimensional-map-control.test.ts",
    domain: "discover-controls-and-filter-labels",
    risk: "HIGH",
    suites: ["home-discover-manual-conformance.yml"],
  },
  {
    path: "apps/morro-digital-platform/tooling/auth-api.mjs",
    domain: "auth",
    risk: "HIGH",
    suites: [],
  },
  {
    path: "apps/morro-digital-platform/tooling/auth-api-logout.test.mjs",
    domain: "auth",
    risk: "HIGH",
    suites: [],
  },
  {
    path: "apps/morro-digital-platform/tooling/ticketing-operator-authorization.test.mjs",
    domain: "payments",
    risk: "CRITICAL",
    suites: ["payments-browser-checkout-contract.yml"],
  },
  {
    path: "apps/morro-digital-platform/src/runtime/shell-v1-i18n.ts",
    domain: "assistant-shell-state",
    risk: "HIGH",
    suites: [
      "assistant-conversation-continuity-browser-contract.yml",
      "assistant-input-menu-flow-v1-parity.yml",
      "home-discover-manual-conformance.yml",
    ],
  },
  {
    path: "apps/morro-digital-platform/src/runtime/shell-v1-i18n.test.ts",
    domain: "assistant-shell-state",
    risk: "HIGH",
    suites: [
      "assistant-conversation-continuity-browser-contract.yml",
      "assistant-input-menu-flow-v1-parity.yml",
      "home-discover-manual-conformance.yml",
    ],
  },
  {
    path: "apps/morro-digital-platform/public/images/tours/volta_ilha_stop1_terceira_praia.jpg",
    domain: "public-tour-catalog",
    risk: "HIGH",
    suites: [
      "map-tour-browser-regression.yml",
      "v1-tour-responsive-browser-regression.yml",
      "home-discover-manual-conformance.yml",
    ],
  },
  {
    path: "apps/morro-digital-platform/public/images/tours/volta_ilha_stop2_garapua.jpg",
    domain: "public-tour-catalog",
    risk: "HIGH",
    suites: [
      "map-tour-browser-regression.yml",
      "v1-tour-responsive-browser-regression.yml",
      "home-discover-manual-conformance.yml",
    ],
  },
  {
    path: "apps/morro-digital-platform/public/images/tours/volta_ilha_stop3_morere.jpg",
    domain: "public-tour-catalog",
    risk: "HIGH",
    suites: [
      "map-tour-browser-regression.yml",
      "v1-tour-responsive-browser-regression.yml",
      "home-discover-manual-conformance.yml",
    ],
  },
  {
    path: "apps/morro-digital-platform/public/images/tours/volta_ilha_stop4_cueira_boipeba.jpg",
    domain: "public-tour-catalog",
    risk: "HIGH",
    suites: [
      "map-tour-browser-regression.yml",
      "v1-tour-responsive-browser-regression.yml",
      "home-discover-manual-conformance.yml",
    ],
  },
  {
    path: "apps/morro-digital-platform/public/images/tours/volta_ilha_stop5_rio_inferno.jpg",
    domain: "public-tour-catalog",
    risk: "HIGH",
    suites: [
      "map-tour-browser-regression.yml",
      "v1-tour-responsive-browser-regression.yml",
      "home-discover-manual-conformance.yml",
    ],
  },
  {
    path: "apps/morro-digital-platform/public/images/tours/volta_ilha_stop6_ostras.jpg",
    domain: "public-tour-catalog",
    risk: "HIGH",
    suites: [
      "map-tour-browser-regression.yml",
      "v1-tour-responsive-browser-regression.yml",
      "home-discover-manual-conformance.yml",
    ],
  },
  {
    path: "apps/morro-digital-platform/public/images/tours/volta_ilha_stop7_cairu.jpg",
    domain: "public-tour-catalog",
    risk: "HIGH",
    suites: [
      "map-tour-browser-regression.yml",
      "v1-tour-responsive-browser-regression.yml",
      "home-discover-manual-conformance.yml",
    ],
  },
  {
    path: "apps/morro-digital-platform/public/images/tours/volta_ilha_stop8_por_do_sol.jpg",
    domain: "public-tour-catalog",
    risk: "HIGH",
    suites: [
      "map-tour-browser-regression.yml",
      "v1-tour-responsive-browser-regression.yml",
      "home-discover-manual-conformance.yml",
    ],
  },
  {
    path: "apps/morro-digital-platform/public/images/tours/trilha_gamboa_stop1_fonte_grande.jpg",
    domain: "public-tour-catalog",
    risk: "HIGH",
    suites: [
      "map-tour-browser-regression.yml",
      "v1-tour-responsive-browser-regression.yml",
      "home-discover-manual-conformance.yml",
    ],
  },
  {
    path: "apps/morro-digital-platform/public/images/tours/trilha_gamboa_stop2_porto_cima.jpg",
    domain: "public-tour-catalog",
    risk: "HIGH",
    suites: [
      "map-tour-browser-regression.yml",
      "v1-tour-responsive-browser-regression.yml",
      "home-discover-manual-conformance.yml",
    ],
  },
  {
    path: "apps/morro-digital-platform/public/images/tours/trilha_gamboa_stop3_ponta_pedra.jpg",
    domain: "public-tour-catalog",
    risk: "HIGH",
    suites: [
      "map-tour-browser-regression.yml",
      "v1-tour-responsive-browser-regression.yml",
      "home-discover-manual-conformance.yml",
    ],
  },
  {
    path: "apps/morro-digital-platform/public/images/tours/trilha_gamboa_stop4_paredao_argila.jpg",
    domain: "public-tour-catalog",
    risk: "HIGH",
    suites: [
      "map-tour-browser-regression.yml",
      "v1-tour-responsive-browser-regression.yml",
      "home-discover-manual-conformance.yml",
    ],
  },
  {
    path: "apps/morro-digital-platform/public/images/tours/trilha_gamboa_stop5_gamboa.jpg",
    domain: "public-tour-catalog",
    risk: "HIGH",
    suites: [
      "map-tour-browser-regression.yml",
      "v1-tour-responsive-browser-regression.yml",
      "home-discover-manual-conformance.yml",
    ],
  },
  {
    path: "apps/morro-digital-platform/public/images/tours/quadriciclo_stop1_base.jpg",
    domain: "public-tour-catalog",
    risk: "HIGH",
    suites: [
      "map-tour-browser-regression.yml",
      "v1-tour-responsive-browser-regression.yml",
      "home-discover-manual-conformance.yml",
    ],
  },
  {
    path: "apps/morro-digital-platform/public/images/tours/quadriciclo_stop2_quarta_quinta_praia.jpg",
    domain: "public-tour-catalog",
    risk: "HIGH",
    suites: [
      "map-tour-browser-regression.yml",
      "v1-tour-responsive-browser-regression.yml",
      "home-discover-manual-conformance.yml",
    ],
  },
  {
    path: "apps/morro-digital-platform/public/images/tours/quadriciclo_stop3_mata_atlantica.jpg",
    domain: "public-tour-catalog",
    risk: "HIGH",
    suites: [
      "map-tour-browser-regression.yml",
      "v1-tour-responsive-browser-regression.yml",
      "home-discover-manual-conformance.yml",
    ],
  },
  {
    path: "apps/morro-digital-platform/public/images/tours/quadriciclo_stop4_mirante_zimbo.jpg",
    domain: "public-tour-catalog",
    risk: "HIGH",
    suites: [
      "map-tour-browser-regression.yml",
      "v1-tour-responsive-browser-regression.yml",
      "home-discover-manual-conformance.yml",
    ],
  },
  {
    path: "apps/morro-digital-platform/public/images/tours/quadriciclo_stop5_garapua.jpg",
    domain: "public-tour-catalog",
    risk: "HIGH",
    suites: [
      "map-tour-browser-regression.yml",
      "v1-tour-responsive-browser-regression.yml",
      "home-discover-manual-conformance.yml",
    ],
  },
];
const owners = (path) =>
  ownership.domains
    .filter((domain) =>
      domain.pathPrefixes.some((prefix) => matchesOwnershipPath(path, prefix)),
    )
    .map((domain) => domain.id);
const aliases = (path) => [path + ".bak", path + "x", path + "/nested.ts"];

for (const [owner, paths] of Object.entries(ownerAdditions)) {
  for (const path of paths) {
    test("exact canonical owner and ordinary boundary: " + path, () => {
      assert.deepEqual(owners(path), [owner]);
      assert.equal(ordinaryPrScope([path], risk, ownership), owner === "map");
      for (const alias of aliases(path))
        assert.deepEqual(owners(alias), [], alias);
    });
  }
}
for (const expected of cases) {
  test("runtime impact and fail-closed aliases: " + expected.path, () => {
    const report = analyzeFiles([expected.path]);
    assert.equal(report.classificationBlocked, false);
    assert.deepEqual(report.unknownFiles, []);
    assert.ok(report.domains.includes(expected.domain));
    assert.equal(report.risk, expected.risk);
    assert.equal(report.nonRuntime, false);
    if (expected.path.includes("/public/images/tours/")) {
      assert.deepEqual(owners(expected.path), ["map"]);
      assert.equal(ordinaryPrScope([expected.path], risk, ownership), true);
      assert.equal(report.needsVisual, true);
    }
    for (const suite of expected.suites)
      assert.ok(report.suites.includes(suite), suite);
    if (expected.domain === "auth") {
      assert.equal(report.needsFullSecurity, true);
      assert.equal(ordinaryPrScope([expected.path], risk, ownership), false);
    } else {
      assert.equal(report.needsBrowser, true);
    }
    for (const alias of aliases(expected.path)) {
      const rejected = analyzeFiles([alias]);
      assert.equal(rejected.classificationBlocked, true, alias);
      assert.ok(rejected.unknownFiles.includes(alias), alias);
    }
  });
}
test("mixed public paths cannot hide critical ticketing or authorization ownership", () => {
  const publicPath = ownerAdditions.map[0];
  const sensitivePath = ownerAdditions.ticketing[0];
  const report = analyzeFiles([publicPath, sensitivePath]);
  assert.equal(report.risk, "CRITICAL");
  assert.equal(report.needsFullRegression, true);
  assert.equal(report.needsDatabase, true);
  assert.equal(report.needsFullSecurity, true);
  assert.equal(report.qualityProfile, "DEEP_PROOF");
  assert.equal(
    ordinaryPrScope([publicPath, sensitivePath], risk, ownership),
    false,
  );
  assert.deepEqual(
    ownership.domains.find((domain) => domain.id === "auth").contracts,
    ["platform-authz"],
  );
  assert.deepEqual(
    ownership.domains.find((domain) => domain.id === "ticketing").contracts,
    ["ticket-fulfillment"],
  );
  assert.equal(risk.semanticRiskFloor["platform-authz"], "critical");
  assert.equal(risk.semanticRiskFloor["ticket-fulfillment"], "critical");
});
test("unregistered assistant code and provider tooling remain outside ordinary admission", () => {
  const unknown = "packages/assistant/src/unregistered-audit-sentinel.ts";
  assert.equal(analyzeFiles([unknown]).classificationBlocked, true);
  assert.equal(ordinaryPrScope([unknown], risk, ownership), false);
  assert.equal(
    ordinaryPrScope(
      ["apps/morro-digital-platform/tooling/assistant-api.mjs"],
      risk,
      ownership,
    ),
    false,
  );
  assert.equal(
    ordinaryPrScope(
      ["apps/morro-digital-platform/tooling/provider-governance.mjs"],
      risk,
      ownership,
    ),
    false,
  );
});
test("the amendment preserves the existing critical workflow impact floor", () => {
  const paths = [
    ".morro/ownership.json",
    "tooling/ci/test-impact-manifest.json",
    "tooling/ci/journey-audit-admission.test.mjs",
    ".morro/changesets/MD-JOURNEY-AUDIT-COVERAGE-ADMISSION-20261031.json",
    ".github/workflows/auth-login-browser-contract.yml",
  ];
  const report = analyzeFiles(paths);
  assert.equal(report.classificationBlocked, false);
  assert.equal(report.risk, "CRITICAL");
  assert.equal(report.nonRuntime, false);
  assert.equal(report.needsFullSecurity, true);
  assert.equal(report.needsFullRegression, true);
  assert.equal(report.qualityProfile, "DEEP_PROOF");
  assert.equal(ordinaryPrScope(paths, risk, ownership), false);
  for (const path of paths) assert.deepEqual(owners(path), ["ci-release"]);
});

test("session recovery workflow and auth fixture preserve their critical proof floor", () => {
  for (const path of [
    ".github/workflows/auth-login-browser-contract.yml",
    "apps/morro-digital-platform/tooling/wp05-session-recovery-browser-contract.cjs",
  ]) {
    const report = analyzeFiles([path]);
    assert.equal(report.classificationBlocked, false);
    assert.ok(report.domains.includes("session-recovery-browser"));
    assert.ok(report.suites.includes("auth-login-browser-contract.yml"));
    assert.equal(report.risk, "CRITICAL");
    assert.equal(report.needsBrowser, true);
    assert.equal(report.needsFullSecurity, true);
    assert.equal(ordinaryPrScope([path], risk, ownership), false);
  }
});
test("CRM referrals keeps its high risk and selects the session recovery proof", () => {
  const path = "apps/admin-crm/public/referrals.js";
  const report = analyzeFiles([path]);
  assert.equal(report.classificationBlocked, false);
  assert.ok(report.domains.includes("crm-browser"));
  assert.ok(report.domains.includes("crm-referrals-session-recovery"));
  assert.equal(report.domains.includes("session-recovery-browser"), false);
  assert.equal(report.risk, "HIGH");
  assert.ok(report.suites.includes("crm-equivalence-browser-contract.yml"));
  assert.ok(report.suites.includes("auth-login-browser-contract.yml"));
  assert.equal(report.needsBrowser, true);
  assert.equal(report.needsVisual, true);
  assert.equal(report.needsDatabase, false);
  assert.equal(report.needsFullSecurity, false);
  assert.equal(ordinaryPrScope([path], risk, ownership), false);
});

test("the additional CRM session recovery selection matches only referrals", () => {
  for (const path of [
    "apps/admin-crm/public/trials.js",
    "apps/admin-crm/public/referrals.html",
    "apps/admin-crm/public/referrals.js.bak",
    "apps/admin-crm/public/referrals.js-extra",
    "tooling/crm/crm-html-access.test.mjs",
  ]) {
    const report = analyzeFiles([path]);
    assert.equal(
      report.domains.includes("crm-referrals-session-recovery"),
      false,
      path,
    );
    assert.equal(
      report.suites.includes("auth-login-browser-contract.yml"),
      false,
      path,
    );
  }
});

test("CRM referrals cannot lower auth or ticketing requirements in mixed changes", () => {
  for (const sensitive of [
    "apps/morro-digital-platform/tooling/auth-api.mjs",
    "apps/morro-digital-platform/tooling/ticketing-operator-authorization.test.mjs",
  ]) {
    const baseline = analyzeFiles([sensitive]);
    const mixed = analyzeFiles([
      "apps/admin-crm/public/referrals.js",
      sensitive,
    ]);
    assert.equal(mixed.risk, baseline.risk, sensitive);
    assert.equal(mixed.needsFullSecurity, true, sensitive);
    assert.equal(mixed.needsDatabase, baseline.needsDatabase, sensitive);
    assert.ok(mixed.suites.includes("auth-login-browser-contract.yml"));
    assert.equal(
      ordinaryPrScope(
        ["apps/admin-crm/public/referrals.js", sensitive],
        risk,
        ownership,
      ),
      false,
    );
  }
});

test("public shell coverage cannot lower workflow or auth risk in a mixed change", () => {
  for (const sensitive of [
    ".github/workflows/auth-login-browser-contract.yml",
    "apps/morro-digital-platform/tooling/auth-api.mjs",
  ]) {
    const paths = [
      "apps/morro-digital-platform/src/runtime/shell-v1-i18n.ts",
      sensitive,
    ];
    const report = analyzeFiles(paths);
    assert.equal(report.needsFullSecurity, true);
    assert.equal(ordinaryPrScope(paths, risk, ownership), false);
    if (sensitive.startsWith(".github/")) {
      assert.equal(report.risk, "CRITICAL");
      assert.equal(report.qualityProfile, "DEEP_PROOF");
    }
  }
});

test("tour media coverage stays exact and cannot hide sensitive mixed changes", () => {
  const asset =
    "apps/morro-digital-platform/public/images/tours/volta_ilha_stop1_terceira_praia.jpg";
  for (const unknown of [
    asset.replace(/\.jpg$/, ".jpeg"),
    "apps/morro-digital-platform/public/images/tours/unregistered-stop.jpg",
    "images/tours/volta_ilha_stop1_terceira_praia.jpg",
  ]) {
    const report = analyzeFiles([unknown]);
    assert.equal(report.classificationBlocked, true);
    assert.ok(report.unknownFiles.includes(unknown));
  }
  const paths = [
    asset,
    "apps/morro-digital-platform/tooling/ticketing-operator-authorization.test.mjs",
  ];
  const mixed = analyzeFiles(paths);
  assert.equal(mixed.risk, "CRITICAL");
  assert.equal(mixed.qualityProfile, "DEEP_PROOF");
  assert.equal(mixed.needsFullSecurity, true);
  assert.equal(mixed.needsDatabase, true);
  assert.equal(ordinaryPrScope(paths, risk, ownership), false);
});
