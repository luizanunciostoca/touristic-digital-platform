import test from "node:test";
import assert from "node:assert/strict";
import { verifyTrustedClaimEvidence } from "../mdctl/scheduler-live.mjs";
import { ordinaryPrScope } from "../fabric/ordinary-pr-policy.mjs";
import { readFileSync } from "node:fs";
const head = "b".repeat(40),
  base = "a".repeat(40),
  wrong = "c".repeat(40);
const names = [
  "trusted-claim-guard-bootstrap",
  "base-controlled-orchestrator-registry-proof",
  "base-controlled-independent-proof / trusted-agent-profile-contract",
];
function fixture() {
  const f = {
    runs: [
      {
        id: 12,
        path: ".github/workflows/morro-claim-guard-trust-bootstrap.yml",
        name: "Trusted Claim Guard Bootstrap",
        event: "pull_request",
        head_sha: head,
        head_branch: "feature",
        pull_requests: [
          { number: 7, base: { sha: base }, head: { sha: head } },
        ],
        created_at: "2026-10-28T00:00:00Z",
        status: "completed",
        conclusion: "success",
      },
    ],
    jobs: names.map((name, i) => ({
      id: 100 + i,
      run_id: 12,
      name,
      status: "completed",
      conclusion: "success",
      head_sha: head,
      html_url: "https://github.com/o/r/actions/runs/12/job/" + (100 + i),
      check_run_url: "https://api.github.com/repos/o/r/check-runs/" + (200 + i),
    })),
    checks: names.map((name, i) => ({
      id: 200 + i,
      name,
      status: "completed",
      conclusion: "success",
      head_sha: head,
      app: { id: 15368, slug: "github-actions" },
      details_url: "https://github.com/o/r/actions/runs/12/job/" + (100 + i),
    })),
  };
  f.api = async (p, opts) => {
    if (p.includes("/contents/")) return { sha: "d".repeat(40) };
    assert.equal(opts.paginate, true);
    if (p.includes("/actions/runs?")) return [{ workflow_runs: f.runs }];
    if (p.includes("/jobs?")) return [{ jobs: f.jobs }];
    if (p.includes("/check-runs?")) return [{ check_runs: f.checks }];
    throw Error("unexpected:" + p);
  };
  return f;
}
const verify = (f) =>
  verifyTrustedClaimEvidence({
    repository: "o/r",
    mainSha: base,
    headSha: head,
    branch: "feature",
    prNumber: 7,
    api: f.api,
  });
test("positive control: complete fixture trusted", async () =>
  assert.equal((await verify(fixture())).trusted, true));
for (const [name, mutate, reason] of [
  [
    "name spoof wrong workflow path",
    (f) => (f.runs[0].path = ".github/workflows/evil.yml"),
    "RUN_MISSING",
  ],
  ["wrong head", (f) => (f.runs[0].head_sha = wrong), "RUN_MISSING"],
  ["wrong PR", (f) => (f.runs[0].pull_requests[0].number = 9), "RUN_MISSING"],
  ["wrong branch", (f) => (f.runs[0].head_branch = "evil"), "RUN_MISSING"],
  ["producer absent", (f) => (f.runs = []), "RUN_MISSING"],
  ["job skipped", (f) => (f.jobs[0].conclusion = "skipped"), "JOB_INVALID"],
  ["spoof check app", (f) => (f.checks[0].app.id = 1), "CHECK_MISSING"],
])
  test(name, async () => {
    const f = fixture();
    mutate(f);
    const r = await verify(f);
    assert.equal(r.trusted, false);
    assert.ok(r.reason.includes(reason), r.reason);
  });
for (const [name, mutate] of [
  [
    "stale producer base rejected",
    (f) => (f.runs[0].pull_requests[0].base.sha = wrong),
  ],
  [
    "job from different run rejected",
    (f) => f.jobs.forEach((j) => (j.run_id = 99)),
  ],
  [
    "same-app unrelated check identities rejected",
    (f) =>
      f.checks.forEach((c) => {
        c.id += 900;
        c.head_sha = wrong;
        c.details_url = "https://github.com/o/r/actions/runs/99/job/999";
      }),
  ],
])
  test(name, async () => {
    const f = fixture();
    mutate(f);
    const r = await verify(f);
    assert.equal(r.trusted, false, JSON.stringify(r));
  });
const risk = JSON.parse(
  readFileSync(new URL("../../.morro/risk-policy.json", import.meta.url)),
);
const own = JSON.parse(
  readFileSync(new URL("../../.morro/ownership.json", import.meta.url)),
);
for (const path of [
  "packages/crm/src/authorization.ts",
  "services/crm/src/leads-http-transport.ts",
  "apps/control-center/public/control-center.js",
  ".github/workflows/morro-merge-gate.yml",
  "tooling/mdctl/native-pr-gate.mjs",
  ".morro/risk-policy.json",
])
  test("sensitive denied ordinary: " + path, () =>
    assert.equal(ordinaryPrScope([path], risk, own), false),
  );

for (const [name, mutate] of [
  ["check correct ID but wrong head", (f) => (f.checks[0].head_sha = wrong)],
  [
    "check correct ID but wrong details",
    (f) =>
      (f.checks[0].details_url =
        "https://github.com/o/r/actions/runs/99/job/100"),
  ],
  ["check correct name and head but wrong id", (f) => (f.checks[0].id = 999)],
  [
    "job URL points outside selected run",
    (f) => {
      f.jobs[0].html_url = "https://github.com/o/r/actions/runs/99/job/100";
      f.checks[0].details_url = f.jobs[0].html_url;
    },
  ],
  ["missing producer base", (f) => delete f.runs[0].pull_requests[0].base],
  [
    "wrong producer association head",
    (f) => (f.runs[0].pull_requests[0].head.sha = wrong),
  ],
])
  test(name, async () => {
    const f = fixture();
    mutate(f);
    assert.equal((await verify(f)).trusted, false);
  });
