import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  readFile,
  readdir,
  mkdtemp,
  mkdir,
  writeFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

const root = process.cwd();
const workflowsDir = resolve(root, ".github/workflows");

test("Pages promotion works without checkout and rejects stale or moved candidates", async () => {
  const source = await readFile(
    resolve(workflowsDir, "pages-after-final-acceptance.yml"),
    "utf8",
  );
  const script = source
    .split("- name: Re-prove the candidate before Pages promotion")[1]
    .split("run: |\n")[1]
    .split("\n      - name: Deploy certified Pages artifact")[0]
    .replace(/^          /gm, "");
  const fixture = await mkdtemp(join(tmpdir(), "morro-pages-no-checkout-"));
  const sha = "a".repeat(40);
  try {
    await mkdir(join(fixture, "bin"));
    await writeFile(
      join(fixture, "bin", "gh"),
      `#!${process.execPath}
const args = process.argv.slice(2);
const env = process.env;
const endpoint = args[1] || "";
let result;
if (args[0] === "api" && endpoint.endsWith("/pages")) result = "workflow";
else if (args[0] === "api" && endpoint.includes("/git/ref/tags/rc/")) result = env.FIXTURE_TAG_SHA;
else if (args[0] === "api" && endpoint.includes("/compare/")) result = "ahead";
else if (args[0] === "api" && endpoint.endsWith("/status")) result = "success";
else if (args[0] === "run" && args[1] === "list") {
  const repoIndex = args.indexOf("--repo");
  if (repoIndex < 0 || args[repoIndex + 1] !== env.GITHUB_REPOSITORY) {
    process.stderr.write("failed to determine base repo: no git checkout\\n");
    process.exit(2);
  }
  result = env.FIXTURE_LATEST_SHA;
} else process.exit(64);
process.stdout.write(result + "\\n");
`,
      { mode: 0o755 },
    );
    const run = (overrides = {}) =>
      execFileSync(
        "bash",
        ["--noprofile", "--norc", "-euo", "pipefail", "-c", script],
        {
          cwd: fixture,
          env: {
            PATH: `${join(fixture, "bin")}:${process.env.PATH}`,
            GITHUB_REPOSITORY: "fixture/morro",
            CERTIFIED_SHA: sha,
            FIXTURE_TAG_SHA: sha,
            FIXTURE_LATEST_SHA: sha,
            ...overrides,
          },
          stdio: "pipe",
        },
      );
    assert.doesNotThrow(() => run());
    assert.throws(() => run({ FIXTURE_LATEST_SHA: "b".repeat(40) }));
    assert.throws(() => run({ FIXTURE_TAG_SHA: "b".repeat(40) }));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("only explicit release control planes dispatch nested workflows", async () => {
  const sources = await workflowSources();
  const dispatchers = [...sources].filter(([, source]) =>
    source.includes("gh workflow run"),
  );
  assert.deepEqual(
    dispatchers.map(([file]) => file),
    ["final-release-acceptance.yml", "production-oci-promotion.yml"],
  );
  assert.ok(
    sources
      .get("production-oci-promotion.yml")
      ?.includes("/run-production-cutover "),
  );
  const manifest = JSON.parse(
    await readFile(
      resolve(root, "tooling/ci/release-acceptance-manifest.json"),
      "utf8",
    ),
  );
  const suites = new Set(manifest.suites.map(({ workflow }) => workflow));
  for (const required of [
    "quality.yml",
    "security-scanning.yml",
    "dependency-security-audit.yml",
    "auth-integration-contract.yml",
    "business-auth-integration-contract.yml",
    "crm-platform-auth-integration-contract.yml",
    "ticketing-m147-contract.yml",
    "ticketing-m148-transaction-contract.yml",
    "control-center-browser-contract.yml",
    "control-center-affiliates-contract.yml",
    "control-center-affiliates-browser-contract.yml",
    "control-center-financial-contract.yml",
    "control-center-financial-browser-contract.yml",
    "control-center-content-contract.yml",
    "control-center-destination-contract.yml",
  ])
    assert.ok(
      suites.has(required),
      `lost mandatory release suite: ${required}`,
    );
  const quality = await readFile(resolve(workflowsDir, "quality.yml"), "utf8");
  assert.match(quality, /^  merge_group:/m);
  const impact = await readFile(resolve(workflowsDir, "ci-impact.yml"), "utf8");
  assert.ok(
    impact.includes(
      "CI_RELEASE_CANDIDATE: ${{ startsWith(github.ref, 'refs/tags/rc/') }}",
    ),
  );
});

test("production cutover serializes MySQL source mutation and preserves recovery state", async () => {
  const workflows = await workflowSources();
  const provision = workflows.get("production-mysql-render-provision.yml");
  const production = workflows.get("production-oci-promotion.yml");
  assert.ok(provision, "production MySQL provision workflow must exist");
  assert.ok(production, "production OCI promotion workflow must exist");

  assert.ok(
    provision.includes(
      "concurrency:\n  group: production-mysql-source-mutation\n  cancel-in-progress: false",
    ),
    "MySQL provision must hold the shared source mutation lock",
  );

  const deploySection = production.split("\n  deploy:\n")[1];
  assert.ok(deploySection, "production OCI workflow must expose deploy job");
  assert.ok(
    deploySection.includes(
      "concurrency:\n      group: production-mysql-source-mutation\n      cancel-in-progress: false",
    ),
    "production cutover deploy job must share the MySQL source mutation lock",
  );

  for (const marker of [
    "Seal rollback state before post-cutover verification",
    "openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -md sha256",
    "production-cutover-recovery-${{ github.run_id }}-${{ github.run_attempt }}",
    "retention-days: 14",
    "RECOVERY_ARTIFACT_ID",
    'test -n "${RECOVERY_ARTIFACT_ID:-}"',
  ]) {
    assert.ok(
      production.includes(marker),
      `production recovery contract missing marker: ${marker}`,
    );
  }

  const sealIndex = production.indexOf(
    "Seal rollback state before post-cutover verification",
  );
  const recoveryUploadIndex = production.indexOf(
    "id: recovery_upload",
    sealIndex,
  );
  const smokeIndex = production.indexOf(
    "Wait for exact-SHA health and readiness",
  );
  const rollbackIndex = production.indexOf(
    "Roll back source and database config on failed verification",
  );
  const destroyIndex = production.indexOf("Destroy ephemeral rollback state");
  assert.ok(sealIndex > 0);
  assert.ok(recoveryUploadIndex > sealIndex);
  assert.ok(smokeIndex > recoveryUploadIndex);
  assert.ok(rollbackIndex > smokeIndex);
  assert.ok(destroyIndex > rollbackIndex);
});

const CANONICAL_STAGING = {
  serviceId: "srv-da4hb6c9v7es7386ttt0",
  serviceName: "morro-digital-v2-staging",
  canonicalUrl: "https://morro-digital-v2-staging.onrender.com",
};

const FORBIDDEN_STAGING_TARGETS = [
  "srv-daqgk83ncjis739tghig",
  "https://morro-digital-v2.onrender.com",
  "srv-d9p0to6gekts73f0lh90",
  "https://morro-digital-staging.onrender.com",
];

async function workflowSources() {
  const files = (await readdir(workflowsDir))
    .filter((name) => /\.ya?ml$/u.test(name))
    .sort();
  return new Map(
    await Promise.all(
      files.map(async (name) => [
        name,
        await readFile(resolve(workflowsDir, name), "utf8"),
      ]),
    ),
  );
}

test("staging promotion is exclusively bound to canonical V2 staging", async () => {
  const workflows = await workflowSources();
  const staging = workflows.get("staging-render-promotion.yml");
  assert.ok(staging, "staging-render-promotion.yml must exist");

  for (const marker of [
    "RENDER_STAGING_DEPLOY_HOOK_URL",
    `EXPECTED_STAGING_SERVICE_ID: ${CANONICAL_STAGING.serviceId}`,
    `EXPECTED_STAGING_SERVICE_NAME: ${CANONICAL_STAGING.serviceName}`,
    `EXPECTED_STAGING_CANONICAL_URL: ${CANONICAL_STAGING.canonicalUrl}`,
    'url.hostname !== "api.render.com"',
    "url.pathname.match(/^\\/deploy\\/(srv-[A-Za-z0-9]+)$/)",
    "staging-deployment-evidence.json",
  ]) {
    assert.ok(
      staging.includes(marker),
      `missing staging target proof marker: ${marker}`,
    );
  }

  for (const forbidden of FORBIDDEN_STAGING_TARGETS) {
    assert.ok(
      !staging.includes(forbidden),
      `staging workflow references forbidden target: ${forbidden}`,
    );
  }

  assert.ok(!/secrets\.RENDER_DEPLOY_HOOK_URL\b/u.test(staging));
  assert.ok(!/secrets\.RENDER_SERVICE_ID\b/u.test(staging));
  assert.ok(!/secrets\.RENDER_CANONICAL_URL\b/u.test(staging));
});

test("staging OCI promotion is bound to the same canonical Render service", async () => {
  const workflows = await workflowSources();
  const stagingOci = workflows.get("staging-oci-promotion.yml");
  assert.ok(stagingOci, "staging-oci-promotion.yml must exist");

  for (const marker of [
    "RENDER_STAGING_IMAGE_DEPLOY_HOOK_URL",
    `EXPECTED_STAGING_SERVICE_ID: ${CANONICAL_STAGING.serviceId}`,
    `EXPECTED_STAGING_SERVICE_NAME: ${CANONICAL_STAGING.serviceName}`,
    `EXPECTED_STAGING_CANONICAL_URL: ${CANONICAL_STAGING.canonicalUrl}`,
    'url.hostname !== "api.render.com"',
    "url.pathname.match(/^\\/deploy\\/(srv-[A-Za-z0-9]+)$/)",
  ]) {
    assert.ok(
      stagingOci.includes(marker),
      `staging OCI target proof missing marker: ${marker}`,
    );
  }

  for (const forbidden of FORBIDDEN_STAGING_TARGETS) {
    assert.ok(
      !stagingOci.includes(forbidden),
      `staging OCI workflow references forbidden target: ${forbidden}`,
    );
  }
});

test("Final Release Acceptance consumes structured staging target evidence", async () => {
  const workflows = await workflowSources();
  const acceptance = workflows.get("final-release-acceptance.yml");
  assert.ok(acceptance, "final-release-acceptance.yml must exist");

  for (const marker of [
    "staging-deployment-evidence.json",
    `.serviceId == "${CANONICAL_STAGING.serviceId}"`,
    `.serviceName == "${CANONICAL_STAGING.serviceName}"`,
    `.canonicalUrl == "${CANONICAL_STAGING.canonicalUrl}"`,
    '.environment == "staging"',
    ".expectedSha == $sha",
    ".liveSha == $sha",
    ".deploymentId | length > 0",
  ]) {
    assert.ok(
      acceptance.includes(marker),
      `Final Release Acceptance missing target evidence marker: ${marker}`,
    );
  }
});

test("Final Release Acceptance binds staging evidence to the exact dispatch request", async () => {
  const workflows = await workflowSources();
  const acceptance = workflows.get("final-release-acceptance.yml");
  const staging = workflows.get("staging-render-promotion.yml");
  assert.ok(acceptance, "final-release-acceptance.yml must exist");
  assert.ok(staging, "staging-render-promotion.yml must exist");

  for (const marker of [
    'request_id="final-acceptance-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"',
    '-f request_id="$request_id"',
    "--json databaseId,headSha,displayTitle,createdAt",
    "select(.headSha == $sha and .displayTitle == $title)",
  ]) {
    assert.ok(
      acceptance.includes(marker),
      `Final Release Acceptance missing exact-run binding marker: ${marker}`,
    );
  }

  assert.ok(
    staging.includes(
      'run-name: "staging-render-promotion:${{ inputs.request_id }}:${{ inputs.expected_sha }}"',
    ),
    "staging promotion must expose the request correlation in its immutable run title",
  );
  assert.ok(staging.includes("request_id:"));
  assert.ok(staging.includes("default: manual"));
});

test("Final Release Acceptance ignores a stale same-SHA staging run until the correlated dispatch is indexed", async () => {
  const source = await readFile(
    resolve(workflowsDir, "final-release-acceptance.yml"),
    "utf8",
  );
  const script = source
    .split("- name: Dispatch exact-SHA staging promotion")[1]
    .split("run: |\n")[1]
    .split("\n      - name: Wait for exact-SHA staging promotion")[0]
    .replace(/^          /gm, "");
  const fixture = await mkdtemp(join(tmpdir(), "morro-staging-run-binding-"));
  const output = join(fixture, "github-output");
  const calls = join(fixture, "run-list-calls");
  const dispatchArgs = join(fixture, "dispatch-args");
  const sha = "1234567890abcdef1234567890abcdef12345678";

  try {
    await writeFile(output, "");
    execFileSync(
      "bash",
      [
        "-euo",
        "pipefail",
        "-c",
        `
gh() {
  if [ "$1 $2" = "workflow run" ]; then
    printf "%s\\n" "$*" > "$DISPATCH_ARGS"
    return 0
  fi

  if [ "$1 $2" = "run list" ]; then
    count=0
    if [ -f "$RUN_LIST_CALLS" ]; then
      count="$(cat "$RUN_LIST_CALLS")"
    fi
    count=$((count + 1))
    printf "%s" "$count" > "$RUN_LIST_CALLS"

    stale_title="staging-render-promotion:final-acceptance-old-1:$GITHUB_SHA"
    current_title="staging-render-promotion:final-acceptance-900-2:$GITHUB_SHA"
    if [ "$count" -lt 3 ]; then
      printf '%s\\n' "[{\\\"databaseId\\\":111,\\\"headSha\\\":\\\"$GITHUB_SHA\\\",\\\"displayTitle\\\":\\\"$stale_title\\\",\\\"createdAt\\\":\\\"2026-09-28T08:00:00Z\\\"}]"
    else
      printf '%s\\n' "[{\\\"databaseId\\\":222,\\\"headSha\\\":\\\"$GITHUB_SHA\\\",\\\"displayTitle\\\":\\\"$current_title\\\",\\\"createdAt\\\":\\\"2026-09-28T09:00:00Z\\\"},{\\\"databaseId\\\":111,\\\"headSha\\\":\\\"$GITHUB_SHA\\\",\\\"displayTitle\\\":\\\"$stale_title\\\",\\\"createdAt\\\":\\\"2026-09-28T08:00:00Z\\\"}]"
    fi
    return 0
  fi

  command gh "$@"
}
sleep() { :; }
${script}
        `,
      ],
      {
        env: {
          ...process.env,
          CANDIDATE_REF: `rc/${sha}`,
          DISPATCH_ARGS: dispatchArgs,
          GITHUB_OUTPUT: output,
          GITHUB_RUN_ATTEMPT: "2",
          GITHUB_RUN_ID: "900",
          GITHUB_SHA: sha,
          RUN_LIST_CALLS: calls,
        },
        stdio: "pipe",
      },
    );

    const result = await readFile(output, "utf8");
    assert.match(result, /^request_id=final-acceptance-900-2$/m);
    assert.match(result, /^run_id=222$/m);
    assert.equal(await readFile(calls, "utf8"), "3");
    assert.match(
      await readFile(dispatchArgs, "utf8"),
      /-f request_id=final-acceptance-900-2/,
    );
    assert.doesNotMatch(result, /^run_id=111$/m);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("active workflows cannot resurrect legacy staging targets or generic Render deploy secrets", async () => {
  const workflows = await workflowSources();
  const legacyOnly = [
    "srv-d9p0to6gekts73f0lh90",
    "https://morro-digital-staging.onrender.com",
  ];
  const genericSecrets = [
    /secrets\.RENDER_DEPLOY_HOOK_URL\b/u,
    /secrets\.RENDER_SERVICE_ID\b/u,
    /secrets\.RENDER_CANONICAL_URL\b/u,
  ];

  for (const [name, source] of workflows) {
    for (const forbidden of legacyOnly) {
      assert.ok(
        !source.includes(forbidden),
        `${name} references legacy Render target ${forbidden}`,
      );
    }
    for (const pattern of genericSecrets) {
      assert.ok(
        !pattern.test(source),
        `${name} uses ambiguous Render secret ${pattern}`,
      );
    }
  }
});

test("release acceptance is intentional and every dispatched suite uses the frozen ref", async () => {
  const workflows = await workflowSources();
  const acceptance = workflows.get("final-release-acceptance.yml");
  assert.ok(!/^  push:/m.test(acceptance));
  assert.ok(acceptance.includes("github.event_name == 'workflow_dispatch'"));
  assert.ok(acceptance.includes('candidate_ref="rc/$GITHUB_SHA"'));
  assert.ok(
    acceptance.includes('gh workflow run "$workflow" --ref "$CANDIDATE_REF"'),
  );
  assert.ok(!acceptance.includes("--ref main"));
  assert.ok(!acceptance.includes('test "$remote_main_sha" = "$GITHUB_SHA"'));
  for (const name of [
    "staging-render-promotion.yml",
    "production-render-promotion.yml",
    "release-promotion-gate.yml",
    "staging-oci-promotion.yml",
    "production-oci-promotion.yml",
  ]) {
    const source = workflows.get(name);
    assert.ok(
      source.includes('node tooling/ci/release-candidate.mjs "$EXPECTED_SHA"'),
      name,
    );
    assert.ok(
      !/test "\$(?:remote_main_sha|REMOTE_MAIN_SHA)" = "\$EXPECTED_SHA"/.test(
        source,
      ),
      name,
    );
  }
  const pages = workflows.get("pages-after-final-acceptance.yml");
  assert.ok(pages.includes("git/ref/tags/rc/"));
  assert.ok(pages.includes("latest_accepted_sha"));
  assert.ok(!pages.includes('test "$current_main_sha"'));
});

test("required quality consumes fail-closed impact and release packaging is explicit", async () => {
  const workflows = await workflowSources();
  const quality = workflows.get("quality.yml");
  assert.ok(quality.includes("uses: ./.github/workflows/ci-impact.yml"));
  assert.ok(quality.includes("if: always()"));
  assert.ok(quality.includes('test "$IMPACT_RESULT" = success'));
  assert.ok(quality.includes("needs.impact.outputs.non_runtime != 'true'"));
  assert.ok(quality.includes("tooling/fabric/*.test.mjs"));
  assert.ok(!quality.includes("github.event.pull_request.draft == false"));
  const impact = workflows.get("ci-impact.yml");
  assert.ok(impact.includes("workflow_call:"));
  assert.ok(!/^  pull_request:/m.test(impact));
  assert.ok(!impact.includes("selective-core:"));
  const certification = workflows.get("release-candidate-certification.yml");
  assert.ok(!/^  (pull_request|push|merge_group):/m.test(certification));
});

test("production cutover locates nested DR evidence artifacts", async () => {
  const production = await readFile(
    resolve(workflowsDir, "production-oci-promotion.yml"),
    "utf8",
  );

  for (const marker of [
    "find /tmp/dr-proof -type f -name 'production-mysql-backup-restore-evidence.json' -print -quit",
    "find /tmp/production-dr-evidence -type f -name 'production-mysql-backup-restore-evidence.json' -print -quit",
  ]) {
    assert.ok(
      production.includes(marker),
      `production DR artifact lookup missing marker: ${marker}`,
    );
  }

  assert.ok(
    production.includes('test -n "$dr_evidence"'),
    "preflight DR lookup must fail closed when evidence is missing",
  );
  assert.ok(
    production.includes('test -n "$evidence"'),
    "deploy DR lookup must fail closed when evidence is missing",
  );

  assert.ok(
    production.includes('test -s "$dr_evidence"'),
    "preflight DR lookup must fail closed when evidence is empty",
  );
  assert.ok(
    production.includes('test -s "$evidence"'),
    "deploy DR lookup must fail closed when evidence is empty",
  );
});
