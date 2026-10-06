import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import {
  ACTIVATION_PATH,
  ASSERTION,
  JOB_NAME,
  REPOSITORY,
  WORKFLOW_NAME,
  WORKFLOW_PATH,
  assertFreshnessWindow,
  buildActivationRecord,
  buildGuardProof,
  buildTrustedFailureLearningProof,
  canonicalFreshnessSeconds,
  currentValidatorRevision,
  runTrustedSemanticProbe,
  trustedContext,
  validateCandidateContract,
} from "./failure-learning-proof-trusted.mjs";

function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
  }).trim();
}
function write(root, path, content) {
  const target = resolve(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}
function secureDetectorsSource() {
  return `export const detectors=Object.freeze({STALE_HEAD:({observation})=>observation.expectedHead===observation.observedHead?"PASS":"BLOCK"});\n`;
}
function secureEngineSource() {
  return `
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {isDeepStrictEqual} from "node:util";
import {detectors as canonicalDetectors} from "./detectors.mjs";
const activationRegistry=()=>JSON.parse(readFileSync(new URL("../../.github/morro-control/failures/guard-activations.json",import.meta.url),"utf8"));
const antiRecurrenceRegistry=()=>JSON.parse(readFileSync(new URL("../../.github/morro-control/tdp-max/anti-recurrence.json",import.meta.url),"utf8")).failures;
const activationFor=(p)=>({guardId:p.guardId,state:"ACTIVE_GUARD",candidateSha:p.candidateSha,candidateBinding:p.candidateBinding,regressionTest:p.regressionTest,independentProof:p.independentProof,independentProofCandidateSha:p.independentProofCandidateSha,freshness:p.freshness,freshnessSeconds:p.freshnessSeconds,observedAt:p.observedAt,expiresAt:p.expiresAt,validatorRevision:p.validatorRevision,activatedAt:p.activatedAt,repository:p.repository,runId:p.runId,runAttempt:p.runAttempt,workflow:p.workflow,job:p.job,assertion:p.assertion});
const canonical=(p)=>activationRegistry().activations.some((item)=>isDeepStrictEqual(item,activationFor(p)));
export function recordOccurrence(existing,occurrence){
  if(!existing)return {...occurrence,fingerprint:"sha256:"+createHash("sha256").update(occurrence.occurrenceId).digest("hex"),state:"OBSERVED",occurrenceIds:[occurrence.occurrenceId],occurrences:[],metrics:{guardEffectiveness:"UNKNOWN"}};
  if(existing.state==="ACTIVE_GUARD"){if(!canonical(existing.guardProof))throw new Error("GUARD_ACTIVATION_NOT_CANONICAL");return {...existing,state:"ROOT_CAUSE_CONFIRMED",recurrenceAfterGuard:true};}
  return existing;
}
export function promoteGuard(incident,proof){
  if(incident.state!=="PREVENTION_PROVEN"||!incident.rootCause)throw new Error("GUARD_PROMOTION_PRECONDITION");
  if(!canonical(proof))throw new Error("GUARD_PROOF_SOURCE_UNVERIFIED");
  return {...incident,state:"ACTIVE_GUARD",guardProof:proof};
}
export function evaluateGuards({operation,domain,registry,observation={}}){
  const canonicalRegistry=antiRecurrenceRegistry();
  if(registry!==undefined&&!isDeepStrictEqual(registry,canonicalRegistry))throw new Error("GUARD_REGISTRY_OVERRIDE_FORBIDDEN");
  return canonicalRegistry.filter((g)=>(g.operations??["*"]).includes("*")||(g.operations??[]).includes(operation)||(g.domains??[]).includes(domain)).map((g)=>({id:g.id,class:g.class,result:canonicalDetectors[g.class]?.({operation,domain,observation})??"NOT_PROVEN"}));
}
`;
}
function maliciousEngineSource() {
  return `
import {readFileSync} from "node:fs";
for(const attack of [()=>process.exit(0),()=>process.stdout.write('{"protocol":1}\\n'),()=>process.env,()=>readFileSync("/etc/passwd","utf8"),()=>({}).constructor.constructor("return process")()]){try{attack()}catch{}}
export function recordOccurrence(){return {state:"ACTIVE_GUARD",guardId:"AR-001"}}
export function promoteGuard(i){return {...i,state:"ACTIVE_GUARD"}}
export function evaluateGuards(){return [{id:"AR-001",class:"STALE_HEAD",result:"PASS"}]}
`;
}
function fixture(
  t,
  {
    secure = true,
    selfActivate = false,
    changeSetId = "MD-TDP-LEARNING-001",
  } = {},
) {
  const root = mkdtempSync(resolve(tmpdir(), "tdp-learning-proof-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, "init", "-q", "-b", "infra/learning");
  git(root, "config", "user.name", "TDP Trusted Proof Test");
  git(root, "config", "user.email", "tdp-proof@example.invalid");
  write(root, "README.md", "base\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "base");
  const base = git(root, "rev-parse", "HEAD");
  const manifestPath = ".morro/changesets/" + changeSetId + ".json";
  write(
    root,
    manifestPath,
    JSON.stringify(
      {
        id: changeSetId,
        baseSha: base,
        branch: "infra/learning",
        owns: {
          paths: [
            "tooling/failure-learning/**",
            ".github/morro-control/failures/**",
          ],
        },
        requiredEvidence: [
          "source-authentication",
          "guard-specific-semantic-proof",
          "canonical-activation",
          "automated-independent-proof",
          "exact-head-identity",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  write(
    root,
    "tooling/failure-learning/engine.mjs",
    secure ? secureEngineSource() : maliciousEngineSource(),
  );
  write(
    root,
    "tooling/failure-learning/detectors.mjs",
    secureDetectorsSource(),
  );
  write(
    root,
    "tooling/failure-learning/activation-authority.mjs",
    'export const authority="ORCHESTRATOR";\n',
  );
  write(root, "tooling/failure-learning/engine.test.mjs", "export {};\n");
  write(
    root,
    ACTIVATION_PATH,
    JSON.stringify(
      {
        schemaVersion: 1,
        authority: "ORCHESTRATOR",
        activations: selfActivate ? [{ guardId: "AR-001" }] : [],
      },
      null,
      2,
    ) + "\n",
  );
  git(root, "add", ".");
  git(root, "commit", "-qm", "candidate");
  return {
    root,
    base,
    candidate: git(root, "rev-parse", "HEAD"),
    manifestPath,
  };
}
function envFor(f) {
  const workflowRef = REPOSITORY + "/" + WORKFLOW_PATH + "@refs/heads/main";
  return {
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "workflow_run",
    GITHUB_REPOSITORY: REPOSITORY,
    GITHUB_WORKFLOW: WORKFLOW_NAME,
    GITHUB_JOB: JOB_NAME,
    GITHUB_RUN_ID: "42",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_WORKFLOW_REF: workflowRef,
    GITHUB_REF: "refs/heads/main",
    GITHUB_SHA: f.base,
    EXPECTED_REPOSITORY: REPOSITORY,
    EXPECTED_HEAD_REPOSITORY: REPOSITORY,
    EXPECTED_BASE_REPOSITORY: REPOSITORY,
    EXPECTED_WORKFLOW: WORKFLOW_NAME,
    EXPECTED_JOB: JOB_NAME,
    EXPECTED_RUN_ID: "42",
    EXPECTED_RUN_ATTEMPT: "1",
    EXPECTED_WORKFLOW_REF: workflowRef,
    EXPECTED_CANDIDATE_SHA: f.candidate,
    EVENT_CANDIDATE_SHA: f.candidate,
    EXPECTED_BASE_SHA: f.base,
    EVENT_BASE_SHA: f.base,
    EXPECTED_BRANCH: "infra/learning",
    EVENT_BRANCH: "infra/learning",
    EXPECTED_BASE_BRANCH: "main",
    TRUSTED_VALIDATOR_SHA: f.base,
    TRUSTED_VALIDATOR_TREE_SHA: "a".repeat(40),
    MANIFEST_PATH: f.manifestPath,
  };
}

test("trusted context requires exact base-controlled workflow_run identity", () => {
  const f = {
    candidate: "b".repeat(40),
    base: "a".repeat(40),
    manifestPath: ".morro/changesets/MD-TDP-LEARNING-001.json",
  };
  const valid = envFor(f);
  assert.equal(trustedContext(valid).runAttempt, 1);
  for (const patch of [
    { GITHUB_EVENT_NAME: "pull_request" },
    { GITHUB_REPOSITORY: "other/repo" },
    { EXPECTED_HEAD_REPOSITORY: "contributor/repo" },
    { GITHUB_WORKFLOW: "candidate-selected" },
    { GITHUB_JOB: "candidate-selected" },
    { GITHUB_RUN_ID: "0" },
    { EXPECTED_RUN_ATTEMPT: "2" },
    { GITHUB_WORKFLOW_REF: "attacker/workflow@refs/heads/main" },
    { GITHUB_REF: "refs/pull/1/merge" },
    { GITHUB_SHA: "d".repeat(40) },
    { EVENT_CANDIDATE_SHA: "d".repeat(40) },
    { EVENT_BASE_SHA: "d".repeat(40) },
    { TRUSTED_VALIDATOR_SHA: "d".repeat(40) },
    { EXPECTED_BRANCH: "other-branch" },
    { EXPECTED_BASE_BRANCH: "release" },
  ])
    assert.throws(() => trustedContext({ ...valid, ...patch }));
});

test("candidate contract accepts governed Failure Learning successors and rejects unrelated ids", (t) => {
  const successor = fixture(t, { changeSetId: "MD-TDP-LEARNING-001-R2" });
  assert.doesNotThrow(() =>
    validateCandidateContract(
      successor.root,
      trustedContext(envFor(successor)),
    ),
  );

  const unrelated = fixture(t, { changeSetId: "MD-TDP-LEARNING-PROOF-709-R2" });
  assert.throws(
    () =>
      validateCandidateContract(
        unrelated.root,
        trustedContext(envFor(unrelated)),
      ),
    /LEARNING_CHANGESET_REQUIRED/u,
  );
});

test("freshness uses canonical 600-second authority and rejects stale/future evidence", () => {
  const freshnessSeconds = canonicalFreshnessSeconds();
  assert.equal(freshnessSeconds, 600);
  const now = Date.now();
  const proof = buildGuardProof(
    {
      candidateSha: "b".repeat(40),
      runId: "42",
      runAttempt: 1,
      workflow: WORKFLOW_PATH,
      job: JOB_NAME,
      assertion: ASSERTION,
    },
    "sha256:" + "c".repeat(64),
    freshnessSeconds,
    now,
  );
  assertFreshnessWindow(proof, freshnessSeconds, now);
  assert.throws(() =>
    assertFreshnessWindow(
      {
        ...proof,
        expiresAt: new Date(Date.parse(proof.expiresAt) + 1000).toISOString(),
      },
      freshnessSeconds,
      now,
    ),
  );
  assert.throws(() =>
    assertFreshnessWindow(proof, freshnessSeconds, now + 600_001),
  );
  const future = new Date(now + 1000).toISOString();
  assert.throws(
    () =>
      assertFreshnessWindow(
        {
          ...proof,
          observedAt: future,
          activatedAt: future,
          expiresAt: new Date(
            now + 1000 + freshnessSeconds * 1000,
          ).toISOString(),
        },
        freshnessSeconds,
        now,
      ),
    /GUARD_OBSERVATION_IN_FUTURE/u,
  );
});

test("activation record binds candidate, freshness, validator and run identity", () => {
  const context = {
    candidateSha: "b".repeat(40),
    runId: "42",
    runAttempt: 1,
    workflow: WORKFLOW_PATH,
    job: JOB_NAME,
    assertion: ASSERTION,
  };
  const proof = buildGuardProof(
    context,
    "sha256:" + "c".repeat(64),
    canonicalFreshnessSeconds(),
  );
  const activation = buildActivationRecord(proof);
  assert.equal(activation.candidateSha, context.candidateSha);
  assert.equal(activation.independentProofCandidateSha, context.candidateSha);
  assert.equal(activation.assertion, ASSERTION);
  assert.equal(activation.freshnessSeconds, 600);
});

test("semantic probe keeps first occurrence inactive and rejects every forged proof field", async (t) => {
  const f = fixture(t);
  const context = trustedContext(envFor(f));
  validateCandidateContract(f.root, context);
  const result = await runTrustedSemanticProbe(
    f.root,
    context,
    currentValidatorRevision(),
  );
  assert.equal(result.activation.state, "ACTIVE_GUARD");
  assert.equal(result.activation.candidateSha, f.candidate);
  assert.deepEqual(result.semanticChecks.rejectedMutations, [
    "guardId",
    "candidateSha",
    "candidateBinding",
    "regressionTest",
    "independentProof",
    "independentProofCandidateSha",
    "freshness",
    "freshnessSeconds",
    "observedAt",
    "expiresAt",
    "validatorRevision",
    "activatedAt",
    "repository",
    "runId",
    "runAttempt",
    "workflow",
    "job",
    "assertion",
  ]);
  assert.equal(result.semanticChecks.persistedActivationMutationRejected, true);
  assert.equal(result.semanticChecks.exactHead, "PASS");
  assert.equal(result.semanticChecks.staleHead, "BLOCK");
});

test("candidate self-activation is rejected before sandbox execution", (t) => {
  const f = fixture(t, { selfActivate: true });
  assert.throws(
    () => validateCandidateContract(f.root, trustedContext(envFor(f))),
    /CANDIDATE_SELF_ACTIVATION_FORBIDDEN/u,
  );
});

test("missing candidate proof source fails closed", (t) => {
  const f = fixture(t);
  rmSync(resolve(f.root, "tooling/failure-learning/engine.mjs"));
  assert.throws(() =>
    validateCandidateContract(f.root, trustedContext(envFor(f))),
  );
});

test("hostile candidate cannot access parent capabilities or forge the parent proof", async (t) => {
  const f = fixture(t, { secure: false });
  await assert.rejects(
    () => buildTrustedFailureLearningProof(f.root, f.manifestPath, envFor(f)),
    /TDP_FAILURE_LEARNING_SANDBOX_REJECTED|SANDBOX_CHILD_REJECTED_CANDIDATE/u,
  );
  assert.equal(typeof process.env, "object");
});

test("final proof is parent-authored, fresh and never activates production", async (t) => {
  const f = fixture(t);
  const proof = await buildTrustedFailureLearningProof(
    f.root,
    f.manifestPath,
    envFor(f),
  );
  assert.equal(proof.status, "pass");
  assert.equal(proof.candidateSha, f.candidate);
  assert.deepEqual(proof.assertions, {
    sourceAuthentication: "PASS",
    guardSpecificSemanticProof: "PASS",
    canonicalActivation: "PASS",
  });
  assert.equal(proof.activationState, "PROVEN_NOT_ACTIVATED");
  assert.equal(proof.activationTemplate.activatedAt, null);
  assert.equal(
    Date.parse(proof.expiresAt),
    Date.parse(proof.observedAt) + proof.freshnessSeconds * 1000,
  );
});

test("workflow trust root is base-controlled and never executes candidate directly", () => {
  const workflow = readFileSync(
    resolve(
      import.meta.dirname,
      "../../.github/workflows/failure-learning-independent-proof.yml",
    ),
    "utf8",
  );
  assert.match(workflow, /^\s*workflow_run:/mu);
  assert.match(workflow, /Trusted Claim Guard Bootstrap/u);
  assert.doesNotMatch(workflow, /pull_request_target/u);
  assert.match(workflow, /ref: \$\{\{ steps\.pr\.outputs\.base_sha \}\}/u);
  assert.match(workflow, /ref: \$\{\{ steps\.pr\.outputs\.candidate_sha \}\}/u);
  assert.equal(
    [...workflow.matchAll(/persist-credentials:\s*false/gu)].length,
    2,
  );
  assert.match(
    workflow,
    /node trusted\/tooling\/quality\/failure-learning-proof-trusted\.mjs candidate/u,
  );
  assert.doesNotMatch(workflow, /node\s+candidate\//u);
});

test("workflow resolves post-merge source identity without weakening relevant proof", () => {
  const workflow = readFileSync(
    resolve(
      import.meta.dirname,
      "../../.github/workflows/failure-learning-independent-proof.yml",
    ),
    "utf8",
  );
  for (const snippet of [
    "workflow_run.pull_requests | length",
    "commits/$UPSTREAM_HEAD_SHA/pulls?per_page=100",
    ".head.sha == $sha",
    ".head.ref == $branch",
    ".head.repo.full_name == $repo",
    "compare/$merge_commit_sha...$GITHUB_SHA",
    'if [ "$relevant" = true ]; then',
  ]) {
    assert.ok(workflow.includes(snippet), "missing workflow guard: " + snippet);
  }
  assert.doesNotMatch(
    workflow,
    /test "\$\(jq -r '\.state' pr\.json\)" = "open"/u,
  );
  const relevance = workflow.indexOf('if [ "$relevant" = true ]; then');
  const exactOpen = workflow.indexOf('test "$pr_state" = "open"', relevance);
  const exactBase = workflow.indexOf(
    'test "$base_sha" = "$GITHUB_SHA"',
    relevance,
  );
  assert.ok(relevance >= 0 && exactOpen > relevance && exactBase > exactOpen);
});

function resolveIdentityStepScript() {
  const workflow = readFileSync(
    resolve(
      import.meta.dirname,
      "../../.github/workflows/failure-learning-independent-proof.yml",
    ),
    "utf8",
  );
  const lines = workflow.split("\n");
  const step = lines.findIndex(
    (line) => line.trim() === "- name: Resolve exact pull request identity",
  );
  assert.ok(step >= 0, "IDENTITY_STEP_MISSING");
  const run = lines.findIndex(
    (line, index) => index > step && line.trim() === "run: |",
  );
  assert.ok(run > step, "IDENTITY_RUN_BLOCK_MISSING");
  const body = [];
  for (let index = run + 1; index < lines.length; index++) {
    const line = lines[index];
    if (/^\s{6}- name:/u.test(line)) break;
    body.push(line.startsWith("          ") ? line.slice(10) : line);
  }
  return body.join("\n");
}

function identityPr({
  number = 764,
  state = "closed",
  mergedAt = "2026-10-05T17:54:39Z",
  mergeCommitSha = "c".repeat(40),
  headSha = "b".repeat(40),
  headBranch = "infra/retire-fastfix-005-20261005",
  baseSha = "a".repeat(40),
} = {}) {
  return {
    number,
    state,
    merged_at: mergedAt,
    merge_commit_sha: mergeCommitSha,
    head: {
      sha: headSha,
      ref: headBranch,
      repo: { full_name: REPOSITORY },
    },
    base: {
      sha: baseSha,
      ref: "main",
      repo: { full_name: REPOSITORY },
    },
  };
}

function runIdentityResolver(
  t,
  {
    payloadPullRequests = [],
    associatedPullRequests = [],
    pr = identityPr(),
    compareStatus = "ahead",
    files = ["docs/retirement.md"],
  } = {},
) {
  const root = mkdtempSync(resolve(tmpdir(), "tdp-workflow-identity-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = resolve(root, "bin");
  mkdirSync(bin, { recursive: true });
  const gh = resolve(bin, "gh");
  writeFileSync(
    gh,
    [
      "#!/usr/bin/env node",
      "const args = process.argv.slice(2);",
      'const endpoint = args.find((arg) => arg.startsWith("repos/")) ?? "";',
      'if (endpoint.includes("/commits/") && endpoint.includes("/pulls?")) {',
      "  process.stdout.write(process.env.MOCK_ASSOCIATED_PRS);",
      '} else if (endpoint.includes("/compare/")) {',
      '  process.stdout.write(process.env.MOCK_COMPARE_STATUS + "\\n");',
      '} else if (endpoint.includes("/files?")) {',
      "  process.stdout.write(process.env.MOCK_FILES);",
      "} else if (/\\/pulls\\/\\d+$/.test(endpoint)) {",
      "  process.stdout.write(process.env.MOCK_PR_JSON);",
      "} else {",
      '  process.stderr.write("UNEXPECTED_GH_ENDPOINT:" + endpoint + "\\n");',
      "  process.exit(97);",
      "}",
      "",
    ].join("\n"),
  );
  chmodSync(gh, 0o755);
  const eventPath = resolve(root, "event.json");
  const outputPath = resolve(root, "output.txt");
  writeFileSync(
    eventPath,
    JSON.stringify({
      workflow_run: {
        pull_requests: payloadPullRequests,
      },
    }),
  );
  writeFileSync(outputPath, "");
  const shellScript = [
    'gh() { node "$MOCK_GH" "$@"; }',
    resolveIdentityStepScript(),
  ].join("\n");
  const result = spawnSync("bash", ["-c", shellScript], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: bin + ":" + process.env.PATH,
      MOCK_GH: gh,
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_OUTPUT: outputPath,
      REPOSITORY,
      UPSTREAM_HEAD_SHA: pr.head.sha,
      UPSTREAM_HEAD_BRANCH: pr.head.ref,
      GITHUB_SHA: pr.base.sha,
      MOCK_ASSOCIATED_PRS: JSON.stringify(associatedPullRequests),
      MOCK_PR_JSON: JSON.stringify(pr),
      MOCK_COMPARE_STATUS: compareStatus,
      MOCK_FILES: files.join("\n") + "\n",
    },
  });
  return {
    ...result,
    outputs: readFileSync(outputPath, "utf8"),
  };
}

test("post-merge resolver behavior is fail-closed for association cardinality and ancestry", async (t) => {
  await t.test("zero fallback associations is rejected", (t) => {
    const pr = identityPr();
    const result = runIdentityResolver(t, {
      associatedPullRequests: [],
      pr,
    });
    assert.notEqual(result.status, 0);
  });

  await t.test(
    "one exact merged association with ahead ancestry is accepted as irrelevant",
    (t) => {
      const pr = identityPr();
      const result = runIdentityResolver(t, {
        associatedPullRequests: [pr],
        pr,
        compareStatus: "ahead",
      });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.outputs, /^pr_number=764$/mu);
      assert.match(result.outputs, /^relevant=false$/mu);
    },
  );

  await t.test("multiple exact fallback associations is rejected", (t) => {
    const pr = identityPr();
    const duplicate = { ...pr, number: 765 };
    const result = runIdentityResolver(t, {
      associatedPullRequests: [pr, duplicate],
      pr,
    });
    assert.notEqual(result.status, 0);
  });

  await t.test("identical merged ancestry is accepted", (t) => {
    const pr = identityPr();
    const result = runIdentityResolver(t, {
      associatedPullRequests: [pr],
      pr,
      compareStatus: "identical",
    });
    assert.equal(result.status, 0, result.stderr);
  });

  await t.test("behind merged ancestry is rejected", (t) => {
    const pr = identityPr();
    const result = runIdentityResolver(t, {
      associatedPullRequests: [pr],
      pr,
      compareStatus: "behind",
    });
    assert.notEqual(result.status, 0);
  });

  await t.test("closed unmerged source is rejected", (t) => {
    const pr = identityPr({ mergedAt: null, mergeCommitSha: null });
    const result = runIdentityResolver(t, {
      associatedPullRequests: [pr],
      pr,
    });
    assert.notEqual(result.status, 0);
  });

  await t.test(
    "one payload PR follows the normal open exact-base path",
    (t) => {
      const pr = identityPr({
        state: "open",
        mergedAt: null,
        mergeCommitSha: null,
      });
      const result = runIdentityResolver(t, {
        payloadPullRequests: [{ number: pr.number }],
        pr,
      });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.outputs, /^pr_number=764$/mu);
    },
  );

  await t.test("multiple payload PR identities are rejected", (t) => {
    const pr = identityPr({
      state: "open",
      mergedAt: null,
      mergeCommitSha: null,
    });
    const result = runIdentityResolver(t, {
      payloadPullRequests: [{ number: 764 }, { number: 765 }],
      pr,
    });
    assert.notEqual(result.status, 0);
  });
});
