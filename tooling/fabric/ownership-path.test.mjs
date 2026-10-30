import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildChangeEnvelope } from "../mdctl/change-envelope.mjs";
import { assertOwnershipCoverage } from "../ci/local-fast-gate.mjs";

const exact = "packages/design-system/package.json";
const controlCenterKeyboardPaths = [
  "apps/control-center/public/control-center-business-cms.js",
  "apps/morro-digital-platform/src/ux/control-center-business-cms-contract.test.ts",
  "apps/morro-digital-platform/tooling/control-center-accessibility-browser-contract.mjs",
  "apps/morro-digital-platform/tooling/control-center-business-cms-browser-contract.mjs",
];

test("Control Center keyboard ownership is exact and preserves auth authority", () => {
  const canonical = JSON.parse(readFileSync(".morro/ownership.json", "utf8"));
  const owners = (file, registry) =>
    registry.domains
      .filter((domain) =>
        domain.pathPrefixes.some((prefix) =>
          prefix.endsWith("/") ? file.startsWith(prefix) : file === prefix,
        ),
      )
      .map((domain) => domain.id);
  for (const file of controlCenterKeyboardPaths) {
    assert.deepEqual(owners(file, canonical), ["auth"], file);
    assert.deepEqual(assertOwnershipCoverage([file], canonical), {
      covered: 1,
    });
    for (const alias of [
      file + ".backup",
      file + "/nested.js",
      file.replace(/\.(js|mjs|cjs|ts)$/u, "-other.$1"),
    ]) {
      assert.deepEqual(owners(alias, canonical), [], alias);
      assert.throws(
        () => assertOwnershipCoverage([alias], canonical),
        /FAST_GATE_OWNERSHIP_UNCOVERED/u,
      );
    }
  }
  assert.deepEqual(
    owners("apps/control-center/public/control-center.js", canonical),
    ["auth"],
  );
  assert.deepEqual(
    canonical.domains.find((domain) => domain.id === "auth").contracts,
    ["platform-authz"],
  );
  assert.equal(
    JSON.parse(readFileSync(".morro/risk-policy.json", "utf8"))
      .semanticRiskFloor["platform-authz"],
    "critical",
  );
  const before = structuredClone(canonical);
  before.domains.find((domain) => domain.id === "auth").pathPrefixes =
    before.domains
      .find((domain) => domain.id === "auth")
      .pathPrefixes.filter(
        (path) => !controlCenterKeyboardPaths.includes(path),
      );
  for (const file of execFileSync("git", ["ls-files", "-z"], {
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)) {
    if (!controlCenterKeyboardPaths.includes(file))
      assert.deepEqual(owners(file, canonical), owners(file, before), file);
  }
});

const controlCenterRoutingPaths = [
  "apps/morro-digital-platform/tooling/control-center-home-overview-v1-browser-contract.cjs",
  "apps/morro-digital-platform/tooling/control-center-visual-golden-v1-browser-contract.cjs",
  "apps/control-center/public/control-center-home-overview-v1.js",
  "apps/control-center/public/control-center-shell-v1.js",
  "apps/control-center/public/control-center-route.js",
  "apps/morro-digital-platform/src/ux/control-center-shell-sidebar-v1-contract.test.ts",
];

test("Control Center Home and routing ownership is exact and preserves auth authority", () => {
  const canonical = JSON.parse(readFileSync(".morro/ownership.json", "utf8"));
  const owners = (file, registry) =>
    registry.domains
      .filter((domain) =>
        domain.pathPrefixes.some((prefix) =>
          prefix.endsWith("/") ? file.startsWith(prefix) : file === prefix,
        ),
      )
      .map((domain) => domain.id);
  for (const file of controlCenterRoutingPaths) {
    assert.deepEqual(owners(file, canonical), ["auth"], file);
    assert.deepEqual(assertOwnershipCoverage([file], canonical), {
      covered: 1,
    });
    for (const alias of [
      file + ".backup",
      file + "/nested.js",
      file.replace(/\.(js|mjs|cjs|ts)$/u, "-other.$1"),
    ]) {
      assert.deepEqual(owners(alias, canonical), [], alias);
      assert.throws(
        () => assertOwnershipCoverage([alias], canonical),
        /FAST_GATE_OWNERSHIP_UNCOVERED/u,
      );
    }
  }
  assert.deepEqual(
    owners("apps/control-center/public/control-center.js", canonical),
    ["auth"],
  );
  assert.deepEqual(
    canonical.domains.find((domain) => domain.id === "auth").contracts,
    ["platform-authz"],
  );
  assert.equal(
    JSON.parse(readFileSync(".morro/risk-policy.json", "utf8"))
      .semanticRiskFloor["platform-authz"],
    "critical",
  );
  const before = structuredClone(canonical);
  before.domains.find((domain) => domain.id === "auth").pathPrefixes =
    before.domains
      .find((domain) => domain.id === "auth")
      .pathPrefixes.filter((path) => !controlCenterRoutingPaths.includes(path));
  for (const file of execFileSync("git", ["ls-files", "-z"], {
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)) {
    if (!controlCenterRoutingPaths.includes(file))
      assert.deepEqual(owners(file, canonical), owners(file, before), file);
  }
});

const directory = "tooling/ci/";
const ownership = {
  domains: [{ id: "ci-release", pathPrefixes: [exact, directory] }],
};
const riskPolicy = {
  ...JSON.parse(
    readFileSync(
      new URL("../../.morro/risk-policy.json", import.meta.url),
      "utf8",
    ),
  ),
  criticalPaths: [],
  highPaths: ["tooling/"],
  lowExtensions: [".md"],
  semanticRiskFloor: {},
};
const graph = {
  contracts: {
    "boundary-fixture": { owners: ["ci-release"], consumers: ["consumer"] },
  },
};
const template = JSON.parse(
  readFileSync(
    new URL("../../.morro/changesets/MD-TDP-V32-OPT-001.json", import.meta.url),
    "utf8",
  ),
);
const cases = [
  [exact, true],
  ["tooling/ci/subdir/proof.mjs", true],
  [exact + ".backup", false],
  [exact + "x", false],
  [exact + "-old", false],
  [exact + "/child", false],
  ["packages/design-system/package.jsonc", false],
  ["packages/design-system-extra/package.json", false],
  ["packages/design-system/package.JSON", false],
  ["packages/design-system-copy/package.json", false],
  ["tooling/ci-other/proof.mjs", false],
  ["tooling/civil/proof.mjs", false],
];
function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function fixture(path) {
  const root = mkdtempSync(join(tmpdir(), "tdp-ownership-boundary-"));
  const write = (path, value) => {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, value);
  };
  try {
    git(root, "init", "-q");
    git(root, "config", "user.name", "Boundary fixture");
    git(root, "config", "user.email", "boundary@example.invalid");
    write(".morro/ownership.json", JSON.stringify(ownership));
    write(".morro/risk-policy.json", JSON.stringify(riskPolicy));
    write(".morro/contract-graph.json", JSON.stringify(graph));
    git(root, "add", ".");
    git(
      root,
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "fixture baseline",
    );
    const base = git(root, "rev-parse", "HEAD");
    write(path, "{}\n");
    git(root, "add", "--", path);
    git(
      root,
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "fixture changed path",
    );
    return { root, base };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}
for (const [path, owned] of cases) {
  test("ownership consumers agree: " + path, async (t) => {
    const { root, base } = fixture(path);
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const expected = owned ? ["ci-release"] : [];
    const run = (script, args) =>
      JSON.parse(
        execFileSync(
          process.execPath,
          [fileURLToPath(new URL(script, import.meta.url)), ...args],
          { cwd: root, encoding: "utf8" },
        ),
      );
    await t.test(
      "planning respects exact file and directory boundaries",
      () => {
        const report = run("./plan-change.mjs", [
          "--base",
          base,
          "--head",
          "HEAD",
        ]);
        assert.deepEqual(report.changedFiles, [path]);
        assert.deepEqual(report.ownedDomains, expected);
        assert.deepEqual(
          report.touchedContracts,
          owned ? ["boundary-fixture"] : [],
        );
        assert.deepEqual(
          report.impactedDomains,
          owned ? ["ci-release", "consumer"] : [],
        );
      },
    );
    await t.test("impact respects exact file and directory boundaries", () => {
      const report = run("./compute-impact.mjs", [base]);
      assert.deepEqual(report.files, [path]);
      assert.deepEqual(report.ownedDomains, expected);
      assert.deepEqual(
        report.touchedContracts,
        owned ? ["boundary-fixture"] : [],
      );
      assert.deepEqual(
        report.impactedDomains,
        owned ? ["ci-release", "consumer"] : [],
      );
    });
    await t.test("envelope fails closed for unmapped aliases", () => {
      const changeSet = {
        ...structuredClone(template),
        id: "MD-OWNERSHIP-BOUNDARY-FIXTURE",
        objective: "ownership-boundary-regression",
        baseSha: base,
        branch: "fix/ownership-boundary-fixture",
        state: "IMPLEMENTING",
        risk: "high",
        owns: { paths: [path], contracts: [] },
        dependencies: [],
      };
      const build = () =>
        buildChangeEnvelope({
          rootCause: "prefix collision",
          semanticImpact: "incorrect ownership attribution",
          probablePaths: [path],
          changeSet,
          ownership,
          riskPolicy,
        });
      if (owned) assert.deepEqual(build().ownershipDomains, expected);
      else assert.throws(build, /CHANGE_ENVELOPE_OWNERSHIP_UNMAPPED/u);
    });
    await t.test("admission keeps its exact-file boundary", () => {
      if (owned)
        assert.deepEqual(assertOwnershipCoverage([path], ownership), {
          covered: 1,
        });
      else
        assert.throws(
          () => assertOwnershipCoverage([path], ownership),
          /FAST_GATE_OWNERSHIP_UNCOVERED/u,
        );
    });
  });
}

test("assistant and text voice UX ownership uses exact map literals", () => {
  const canonical = JSON.parse(readFileSync(".morro/ownership.json", "utf8"));
  const paths = [
    "apps/morro-digital-platform/src/development/leaflet-compatibility-sdk.ts",
    "apps/morro-digital-platform/src/browser-entry.ts",
    "apps/morro-digital-platform/src/assistant/assistant-ui-state.ts",
    "apps/morro-digital-platform/src/assistant/browser-assistant-runtime.ts",
    "apps/morro-digital-platform/src/assistant/assistant-shell-ui.ts",
    "apps/morro-digital-platform/src/assistant/assistant-shell-ui.test.ts",
    "apps/morro-digital-platform/src/layouts/app-shell.ts",
    "apps/morro-digital-platform/src/ux/home-discover-manual-conformance.test.ts",
    "apps/morro-digital-platform/tooling/home-discover-manual-conformance.mjs",
  ];
  const owners = (file, registry) =>
    registry.domains
      .filter((domain) =>
        domain.pathPrefixes.some((prefix) =>
          prefix.endsWith("/") ? file.startsWith(prefix) : file === prefix,
        ),
      )
      .map((domain) => domain.id);
  for (const path of paths) {
    assert.deepEqual(owners(path, canonical), ["map"], path);
    assert.deepEqual(assertOwnershipCoverage([path], canonical), {
      covered: 1,
    });
    for (const alias of [path + ".backup", path + "/nested.ts"]) {
      assert.deepEqual(owners(alias, canonical), []);
      assert.throws(
        () => assertOwnershipCoverage([alias], canonical),
        /FAST_GATE_OWNERSHIP_UNCOVERED/,
      );
    }
  }
  const crmPaths = [
    "packages/crm/src/authorization.ts",
    "packages/crm/src/authorization.test.ts",
    "services/crm/src/contracts-http-transport.ts",
    "services/crm/src/followups-http-transport.ts",
    "services/crm/src/lead-detail-http-transport.ts",
    "services/crm/src/leads-http-transport.ts",
    "services/crm/src/meetings-http-transport.ts",
    "services/crm/src/proposals-http-transport.ts",
    "services/crm/src/referrals-http-transport.ts",
    "services/crm/src/trials-http-transport.ts",
    "services/crm/src/trials-http-transport.test.ts",
    "services/crm/src/referrals-http-transport.test.ts",
    "services/crm/src/crm-auth-composition.test.mjs",
    "services/crm/vitest.config.mjs",
  ];
  for (const path of crmPaths) {
    assert.deepEqual(owners(path, canonical), ["auth"], path);
    assert.deepEqual(assertOwnershipCoverage([path], canonical), {
      covered: 1,
    });
    for (const alias of [path + ".backup", path + "/nested.ts"]) {
      assert.deepEqual(owners(alias, canonical), []);
      assert.throws(
        () => assertOwnershipCoverage([alias], canonical),
        /FAST_GATE_OWNERSHIP_UNCOVERED/,
      );
    }
  }
  assert.ok(
    canonical.domains
      .find((domain) => domain.id === "auth")
      .contracts.includes("platform-authz"),
  );
  const before = structuredClone(canonical);
  before.domains.find((domain) => domain.id === "auth").pathPrefixes =
    before.domains
      .find((domain) => domain.id === "auth")
      .pathPrefixes.filter((path) => !crmPaths.includes(path));
  before.domains.find((domain) => domain.id === "map").pathPrefixes =
    before.domains
      .find((domain) => domain.id === "map")
      .pathPrefixes.filter((path) => !paths.includes(path));
  const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  for (const path of tracked.filter(
    (path) => !paths.includes(path) && !crmPaths.includes(path),
  )) {
    assert.deepEqual(
      owners(path, canonical),
      owners(path, before),
      `unrelated ownership changed: ${path}`,
    );
  }
  assert.deepEqual(
    owners(
      "apps/morro-digital-platform/public/tourist-shell-v2.css",
      canonical,
    ),
    ["map"],
  );
});

test("pending UX CRM affiliate and gesture ownership stays exact and preserves auth contract", () => {
  const additions = {
    map: [
      "apps/morro-digital-platform/src/ux/manual-visual-conformance-authority.test.ts",
      "apps/morro-digital-platform/src/home/home-discover-navigation.ts",
      "apps/morro-digital-platform/src/home/manual-place-search.ts",
      "apps/morro-digital-platform/src/home/manual-place-search.test.ts",
      "apps/morro-digital-platform/src/ux/tour-wave-d-contract.test.ts",
      "apps/morro-digital-platform/tooling/wave-a-discover-convergence.mjs",
      "apps/morro-digital-platform/tooling/wave-a-pan-gesture.mjs",
      "apps/morro-digital-platform/tooling/wave-a-pan-gesture.test.mjs",
    ],
    auth: [
      "packages/crm/src/ai-content-contract.test.ts",
      "packages/crm/src/contracts-boundary.test.ts",
      "packages/crm/src/followups-boundary.test.ts",
      "packages/crm/src/lead-detail-boundary.test.ts",
      "packages/crm/src/leads-boundary.test.ts",
      "packages/crm/src/meetings-boundary.test.ts",
      "packages/crm/src/metrics-boundary.test.ts",
      "packages/crm/src/proposals-boundary.test.ts",
      "packages/crm/src/referrals-boundary.test.ts",
      "packages/crm/src/trials-boundary.test.ts",
      "services/crm/src/contracts-http-transport.test.ts",
      "services/crm/src/followups-http-transport.test.ts",
      "services/crm/src/lead-detail-http-transport.test.ts",
      "services/crm/src/leads-http-transport.test.ts",
      "services/crm/src/meetings-http-transport.test.ts",
      "services/crm/src/metrics-http-transport.test.ts",
      "services/crm/src/proposals-http-transport.test.ts",
      "apps/morro-digital-platform/tooling/affiliates-api.mjs",
      "apps/morro-digital-platform/tooling/affiliates-api.test.mjs",
      "apps/morro-digital-platform/tooling/affiliate-portal-runtime-wiring.test.mjs",
    ],
  };
  const canonical = JSON.parse(readFileSync(".morro/ownership.json", "utf8"));
  const owners = (file, registry) =>
    registry.domains
      .filter((d) =>
        d.pathPrefixes.some((p) =>
          p.endsWith("/") ? file.startsWith(p) : file === p,
        ),
      )
      .map((d) => d.id);
  for (const [domain, paths] of Object.entries(additions))
    for (const file of paths) {
      assert.deepEqual(owners(file, canonical), [domain], file);
      assert.deepEqual(assertOwnershipCoverage([file], canonical), {
        covered: 1,
      });
      for (const alias of [
        file + ".backup",
        file + "/nested.ts",
        file.replace(/\.(mjs|ts)$/u, "-other.$1"),
      ]) {
        assert.deepEqual(owners(alias, canonical), [], alias);
        assert.throws(
          () => assertOwnershipCoverage([alias], canonical),
          /FAST_GATE_OWNERSHIP_UNCOVERED/,
        );
      }
    }
  assert.deepEqual(canonical.domains.find((d) => d.id === "auth").contracts, [
    "platform-authz",
  ]);
  assert.equal(
    JSON.parse(readFileSync(".morro/risk-policy.json", "utf8"))
      .semanticRiskFloor["platform-authz"],
    "critical",
  );
  const before = structuredClone(canonical);
  for (const [domain, paths] of Object.entries(additions))
    before.domains.find((d) => d.id === domain).pathPrefixes = before.domains
      .find((d) => d.id === domain)
      .pathPrefixes.filter((p) => !paths.includes(p));
  const added = Object.values(additions).flat();
  const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  for (const file of tracked.filter((f) => !added.includes(f)))
    assert.deepEqual(owners(file, canonical), owners(file, before), file);
});

test("service lint config and platform auth composition have distinct exact owners", () => {
  const additions = {
    "services/crm/eslint.config.mjs": "ci-release",
    "apps/morro-digital-platform/tooling/dev-server.mjs": "auth",
  };
  const canonical = JSON.parse(readFileSync(".morro/ownership.json", "utf8"));
  const owners = (file, registry) =>
    registry.domains
      .filter((d) =>
        d.pathPrefixes.some((p) =>
          p.endsWith("/") ? file.startsWith(p) : file === p,
        ),
      )
      .map((d) => d.id);
  for (const [file, owner] of Object.entries(additions)) {
    assert.deepEqual(owners(file, canonical), [owner], file);
    assert.deepEqual(assertOwnershipCoverage([file], canonical), {
      covered: 1,
    });
    for (const alias of [
      file + ".backup",
      file + "/nested.mjs",
      file.replace(".mjs", "-other.mjs"),
    ]) {
      assert.deepEqual(owners(alias, canonical), [], alias);
      assert.throws(
        () => assertOwnershipCoverage([alias], canonical),
        /FAST_GATE_OWNERSHIP_UNCOVERED/,
      );
    }
  }
  assert.deepEqual(canonical.domains.find((d) => d.id === "auth").contracts, [
    "platform-authz",
  ]);
  assert.equal(
    JSON.parse(readFileSync(".morro/risk-policy.json", "utf8"))
      .semanticRiskFloor["platform-authz"],
    "critical",
  );
  const before = structuredClone(canonical);
  for (const domain of before.domains)
    domain.pathPrefixes = domain.pathPrefixes.filter((p) => !(p in additions));
  const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  for (const file of tracked.filter((f) => !(f in additions)))
    assert.deepEqual(owners(file, canonical), owners(file, before), file);
});

const confirmedUxOwnerPaths = [
  "apps/morro-digital-platform/src/ux/navigation-tour-manual-conformance.test.ts",
  "apps/morro-digital-platform/src/home/home-discover-navigation.test.ts",
  "apps/morro-digital-platform/tooling/device-saved-itineraries-browser-contract.cjs",
  "apps/morro-digital-platform/src/weather/weather-widget.ts",
  "apps/morro-digital-platform/src/weather/weather-widget.test.ts",
  "apps/morro-digital-platform/src/weather/weather-i18n.ts",
  "apps/morro-digital-platform/src/weather/weather-i18n.test.ts",
  "apps/morro-digital-platform/src/weather/weather-forecast-modal.ts",
  "apps/morro-digital-platform/tooling/weather-v1-i18n-browser-parity.mjs",
  "apps/morro-digital-platform/src/pwa/pwa-contract.test.ts",
  "apps/morro-digital-platform/src/assistant/browser-assistant-runtime.test.ts",
];
test("confirmed UX runtime and proof files have exact map ownership", () => {
  const current = JSON.parse(
    readFileSync(
      new URL("../../.morro/ownership.json", import.meta.url),
      "utf8",
    ),
  );
  for (const path of confirmedUxOwnerPaths) {
    assert.doesNotThrow(() => assertOwnershipCoverage([path], current));
    assert.throws(() => assertOwnershipCoverage([path + ".bak"], current));
  }
});

test("grouped marker semantic consumers have exact map ownership", () => {
  const current = JSON.parse(
    readFileSync(
      new URL("../../.morro/ownership.json", import.meta.url),
      "utf8",
    ),
  );
  for (const path of [
    "apps/morro-digital-platform/src/assistant/assistant-menu-command-router.ts",
    "apps/morro-digital-platform/src/assistant/assistant-menu-command-router.test.ts",
    "apps/morro-digital-platform/src/assistant/assistant-contextual-state.ts",
    "apps/morro-digital-platform/src/assistant/assistant-contextual-state.test.ts",
    "apps/morro-digital-platform/src/ux/place-search-explore-v2-contract.test.ts",
  ]) {
    assert.doesNotThrow(() => assertOwnershipCoverage([path], current));
    for (const suffix of [".bak", "-other", "/child"])
      assert.throws(() => assertOwnershipCoverage([path + suffix], current));
  }
});

test("semantic explore analytics has narrow map ownership", () => {
  const current = JSON.parse(
    readFileSync(
      new URL("../../.morro/ownership.json", import.meta.url),
      "utf8",
    ),
  );
  for (const path of [
    "apps/morro-digital-platform/src/analytics/browser-analytics.ts",
    "apps/morro-digital-platform/src/analytics/browser-analytics.test.ts",
  ]) {
    assert.deepEqual(
      current.domains
        .filter((domain) => domain.pathPrefixes.includes(path))
        .map((domain) => domain.id),
      ["map"],
    );
    assert.doesNotThrow(() => assertOwnershipCoverage([path], current));
    for (const suffix of [".bak", "-other", "/child"])
      assert.throws(() => assertOwnershipCoverage([path + suffix], current));
  }
});

test("staging Blueprint has exact ci-release ownership without aliases", () => {
  const canonical = JSON.parse(
    readFileSync(
      new URL("../../.morro/ownership.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(
    assertOwnershipCoverage(["render.staging.yaml"], canonical),
    { covered: 1 },
  );
  const domain = canonical.domains.find((entry) => entry.id === "ci-release");
  assert.ok(domain.pathPrefixes.includes("render.staging.yaml"));
  for (const alias of [
    "render.staging.yaml.backup",
    "render.staging.yaml/child",
    "render.staging.yamlx",
  ]) {
    assert.throws(
      () => assertOwnershipCoverage([alias], canonical),
      /FAST_GATE_OWNERSHIP_UNCOVERED/,
    );
  }
});
