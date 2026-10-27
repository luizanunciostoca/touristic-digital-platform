import { buildClaimAcquisition } from "../mdctl/claim-lifecycle.mjs";
import { buildClaimGuardProof } from "../fabric/claim-guard.mjs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import {
  realpathSync,
  cpSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  existsSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import {
  CSS_ENTRY_ORDER_CORRECTION as C,
  CSS_PREPARATION_ACTIONS,
  CLOUD_CSS_RECOVERY as CLOUD,
  validateCloudCorrectionProposal,
  validateCloudCorrectionHistory,
  cloudCorrectionApprovalBody,
  collectCloudCorrectionProposal,
  CORRECTION,
  correctionEnvelope,
  correctionClaim,
  correctionDigest,
  correctionKey,
  validateCorrectionGrant,
  validateCorrectionHistory,
  assertCorrectionAuthority,
  assertCssProvisioningAuthority,
} from "../mdctl/task-correction-authority.mjs";
import {
  persistCssCorrection,
  prepareCssCorrectionWorkspace,
  prepareCssEntryOrderCorrection,
  validateCssCorrectionInputs,
} from "../mdctl/css-entry-order-correction-runtime.mjs";

const sha = "a".repeat(40),
  hash = "sha256:" + "b".repeat(64);
function grant() {
  const g = {
    schemaVersion: 2,
    kind: "TDP_CSS_ENTRY_ORDER_CORRECTION_DELEGATION",
    repository: C.repository,
    owner: C.owner,
    executor: C.executor,
    predecessor: C.predecessor,
    successor: C.successor,
    branch: C.branch,
    taskDigest: C.taskDigest,
    handoffDigest: C.handoffDigest,
    manifestDigest: C.manifestDigest,
    envelopeDigest: hash,
    claimDigest: hash,
    nonce: "fixture-css-grant-0000000001",
    issuedAt: "2026-10-25T03:00:00.000Z",
    expiresAt: "2026-10-25T03:30:00.000Z",
    state: "ISSUED",
    reservation: null,
    workspace:
      C.nativeHome +
      "/worktrees/" +
      C.successor +
      "-fixture-lease-0001-000000000000",
  };
  g.provisioningLease = lease(g, "0".repeat(40));
  return g;
}
function lease(g, sourceMainSha) {
  return {
    schemaVersion: 1,
    leaseId: "fixture-lease-0001",
    taskId: C.successor,
    executor: g.executor,
    workspace: g.workspace,
    branch: g.branch,
    actions: [...CSS_PREPARATION_ACTIONS],
    issuedAt: g.issuedAt,
    expiresAt: g.expiresAt,
    sourceMainSha,
  };
}
function receipt(g, changes = {}) {
  const l = g.provisioningLease;
  return {
    schemaVersion: 1,
    taskId: C.successor,
    executor: g.executor,
    leaseId: l.leaseId,
    workspace: g.workspace,
    commonDir: C.nativeHome + "/repos/touristic-digital-platform.git",
    sourceMainSha: l.sourceMainSha,
    detachedHeadSha: l.sourceMainSha,
    controllerRepository: C.controllerRepository,
    controllerCommitSha: C.controllerCommitSha,
    controllerBlobSha: C.controllerBlobSha,
    nativeIssueNumber: 1,
    requestSha256: "b".repeat(64),
    attestationCommentId: 2,
    resultCommentId: 3,
    receiptSha256: "c".repeat(64),
    createdAt: g.issuedAt,
    verifiedAt: g.issuedAt,
    ...changes,
  };
}
function history() {
  const issued = grant();
  return [
    { commitSha: sha, grant: issued },
    {
      commitSha: "c".repeat(40),
      grant: {
        ...issued,
        state: "CONSUMED",
        reservation: {
          key: correctionKey(issued.handoffDigest, C.successor),
          commitSha: sha,
          issuedCommitSha: sha,
          provisioningReceipt: receipt(issued),
        },
      },
    },
  ];
}
test("one bounded profile uses existing history without creating authority", () => {
  assert.equal(validateCorrectionGrant(grant()).state, "ISSUED");
  const checked = validateCorrectionHistory(history(), "2026-10-25T03:01:00Z");
  assert.equal(checked.grant.state, "CONSUMED");
  assert.throws(() => assertCorrectionAuthority(checked, {}), /UNVERIFIED/);
  assert.notEqual(
    correctionKey(C.handoffDigest, C.successor),
    correctionKey(C.handoffDigest, CORRECTION.successor),
  );
});
for (const [name, mutate, code] of [
  ["owner", (g) => (g.owner = "RECOVERY"), /IDENTITY:owner/],
  ["executor", (g) => (g.executor = "RECOVERY"), /IDENTITY:executor/],
  ["pair", (g) => (g.predecessor = "MD-OTHER"), /IDENTITY:predecessor/],
  ["successor", (g) => (g.successor = "MD-OTHER"), /FIELDS|IDENTITY/],
  ["branch", (g) => (g.branch = "fix/other"), /IDENTITY:branch/],
  ["task digest", (g) => (g.taskDigest = hash), /PIN:taskDigest/],
  ["handoff digest", (g) => (g.handoffDigest = hash), /PIN:handoffDigest/],
  [
    "historical manifest",
    (g) => (g.manifestDigest = hash),
    /PIN:manifestDigest/,
  ],
  [
    "recovery workspace",
    (g) => (g.workspace = "/workspace/recovery"),
    /WORKSPACE/,
  ],
  ["traversal", (g) => (g.workspace += "/../other"), /WORKSPACE/],
  ["unknown field", (g) => (g.scope = "*"), /FIELDS/],
  ["validity", (g) => (g.expiresAt = "2026-10-25T03:30:01Z"), /VALIDITY/],
  ["empty validity", (g) => (g.expiresAt = g.issuedAt), /TIME/],
  [
    "consumed without reservation",
    (g) => (g.state = "CONSUMED"),
    /CONSUMPTION_REQUIRED/,
  ],
])
  test("grant rejects " + name, () => {
    const g = grant();
    mutate(g);
    assert.throws(() => validateCorrectionGrant(g), code);
  });
for (const [name, mutate, code] of [
  ["expiration", (h) => {}, /EXPIRED/],
  [
    "revocation",
    (h) =>
      h.push({
        commitSha: "e".repeat(40),
        grant: { ...h[1].grant, state: "REVOKED" },
      }),
    /REVOKED/,
  ],
  [
    "reuse",
    (h) =>
      h.push({ commitSha: "e".repeat(40), grant: structuredClone(h[1].grant) }),
    /TRANSITION/,
  ],
  [
    "workspace change",
    (h) => (h[1].grant.workspace += "-other"),
    /IDENTITY_CHANGED|PROVISION_BINDING/,
  ],
  [
    "double reservation",
    (h) => (h[1].grant.reservation.key = "f".repeat(64)),
    /RESERVATION_KEY/,
  ],
  [
    "wrong issuance",
    (h) => (h[1].grant.reservation.issuedCommitSha = "f".repeat(40)),
    /CONSUMPTION_ISSUANCE|RESERVATION_COMMIT/,
  ],
])
  test("history rejects " + name, () => {
    const h = history();
    mutate(h);
    assert.throws(
      () =>
        validateCorrectionHistory(
          h,
          name === "expiration"
            ? "2026-10-25T03:30:00Z"
            : "2026-10-25T03:01:00Z",
        ),
      code,
    );
  });

test("non-Native workspace rejection is independent of cwd", async () => {
  const temporary = realpathSync(tmpdir());
  const parent = temporary.startsWith(C.nativeHome + "/worktrees/")
    ? realpathSync(dirname(C.nativeHome))
    : temporary;
  const root = mkdtempSync(join(parent, "non-native-correction-"));
  try {
    assert.equal(root.startsWith(C.nativeHome + "/worktrees/"), false);
    await assert.rejects(
      prepareCssEntryOrderCorrection({
        root,
        workspace: root,
        expectedMain: sha,
      }),
      /NATIVE_REQUIRED/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("caller cannot forge predecessor bytes even with historical owner and ID", () => {
  assert.throws(
    () => validateCssCorrectionInputs(inputFixture()),
    /TASK_DIGEST/,
  );
});

function storeFixture() {
  const root = mkdtempSync(join(tmpdir(), "css-correction-storage-"));
  const common = join(root, "common"),
    parent = join(root, "worktree");
  mkdirSync(common);
  mkdirSync(parent);
  const predecessor = join(root, "predecessor.json"),
    bytes = Buffer.from('{"state":"SUBMITTED"}\n');
  writeFileSync(predecessor, bytes);
  const proposal = {
    task: { changeSetId: C.successor, state: "STARTED" },
    contextPack: { fixture: true },
    leaseRegistry: { leases: {} },
  };
  return {
    root,
    predecessor,
    bytes,
    args: {
      common,
      stateDir: join(parent, "morro-control"),
      key: "a".repeat(64),
      proposal,
      inputs: [{ path: predecessor, bytes }],
      revalidate: () => {},
    },
  };
}
function storageTest(name, body) {
  test(name, async () => {
    const f = storeFixture();
    try {
      await body(f);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });
}
storageTest(
  "atomic canonical files and predecessor immutable; no handoff or dispatch",
  (f) => {
    const before = readFileSync(f.predecessor);
    const result = persistCssCorrection(f.args);
    assert.equal(
      result.state,
      "CORRECTION_PERSISTED_SCHEDULER_RECHECK_REQUIRED",
    );
    assert.deepEqual(
      readdirSync(f.args.stateDir).sort(),
      [
        C.successor + ".context-pack.json",
        C.successor + ".task.json",
        "capability-leases.json",
      ].sort(),
    );
    assert.equal(
      JSON.parse(
        readFileSync(join(f.args.stateDir, C.successor + ".task.json")),
      ).changeSetId,
      C.successor,
    );
    assert.deepEqual(readFileSync(f.predecessor), before);
    assert.equal(
      existsSync(join(f.args.common, "css-started-transfer.lock")),
      false,
    );
  },
);
storageTest("replay cannot rewrite successor or reuse reservation", (f) => {
  persistCssCorrection(f.args);
  const before = readFileSync(
    join(f.args.stateDir, C.successor + ".task.json"),
  );
  assert.throws(() => persistCssCorrection(f.args), /SUCCESSOR_STATE_EXISTS/);
  assert.deepEqual(
    readFileSync(join(f.args.stateDir, C.successor + ".task.json")),
    before,
  );
});
storageTest("same reservation rejects a second destination", (f) => {
  persistCssCorrection(f.args);
  assert.throws(
    () =>
      persistCssCorrection({
        ...f.args,
        stateDir: f.args.stateDir + "-second",
      }),
    /RESERVATION_REPLAY/,
  );
  assert.equal(existsSync(f.args.stateDir + "-second"), false);
});
storageTest("concurrent holder cannot enter shared Native lock", (f) => {
  mkdirSync(join(f.args.common, "css-started-transfer.lock"));
  assert.throws(() => persistCssCorrection(f.args), /EEXIST/);
  assert.equal(existsSync(f.args.stateDir), false);
});
storageTest(
  "input drift before write retains lock without destination",
  (f) => {
    writeFileSync(f.predecessor, '{"changed":true}');
    assert.throws(() => persistCssCorrection(f.args), /INPUT_CHANGED/);
    assert.equal(existsSync(f.args.stateDir), false);
    assert.equal(
      existsSync(join(f.args.common, "css-started-transfer.lock")),
      true,
    );
  },
);
for (const stage of [1, 2])
  storageTest(
    "revalidation failure stage " +
      stage +
      " never returns success or removes lock",
    (f) => {
      let count = 0;
      assert.throws(
        () =>
          persistCssCorrection({
            ...f.args,
            revalidate: () => {
              if (++count === stage) throw Error("FIXTURE_REVALIDATION_FAILED");
            },
          }),
        /FIXTURE_REVALIDATION_FAILED/,
      );
      assert.deepEqual(readFileSync(f.predecessor), f.bytes);
      assert.equal(
        existsSync(join(f.args.common, "css-started-transfer.lock")),
        true,
      );
      assert.equal(existsSync(f.args.stateDir), false);
    },
  );
storageTest("pending transaction is not cleaned up or overwritten", (f) => {
  mkdirSync(f.args.stateDir + ".correction-pending");
  assert.throws(() => persistCssCorrection(f.args), /PENDING_RECONCILIATION/);
});
storageTest(
  "cross-process race permits at most one successful publication",
  (f) => {
    const module = new URL(
      "../mdctl/css-entry-order-correction-runtime.mjs",
      import.meta.url,
    ).href;
    // Separate processes race on the real filesystem lock; no provider calls.
    const script = `import {persistCssCorrection} from ${JSON.stringify(module)};\nimport fs from 'node:fs';\nconst a=JSON.parse(fs.readFileSync(process.argv[1]));a.inputs=a.inputs.map(e=>({...e,bytes:Buffer.from(e.bytes)}));a.revalidate=()=>{};try{persistCssCorrection(a);process.exitCode=0;}catch{process.exitCode=2;}`;
    const cfg = join(f.root, "args.json");
    writeFileSync(
      cfg,
      JSON.stringify({
        ...f.args,
        inputs: f.args.inputs.map((e) => ({ ...e, bytes: [...e.bytes] })),
      }),
    );
    const runner = `import {spawn} from 'node:child_process'; const jobs=[0,1].map(()=>new Promise(r=>{const p=spawn(process.execPath,['--input-type=module','-e',${JSON.stringify(script)},${JSON.stringify(cfg)}],{stdio:'ignore'});p.on('exit',r);}));console.log(JSON.stringify(await Promise.all(jobs)));`;
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", runner],
      { encoding: "utf8", timeout: 10000 },
    );
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout).sort(), [0, 2]);
    assert.deepEqual(readFileSync(f.predecessor), f.bytes);
  },
);

function inputFixture() {
  const g = grant();
  return {
    task: {
      changeSetId: C.predecessor,
      owner: C.executor,
      state: "SUBMITTED",
      candidateSha: C.handoffSha,
    },
    changeSet: {},
    handoff: { digest: C.handoffDigest, candidateSha: C.handoffSha },
    successor: {
      id: C.successor,
      branch: C.branch,
      owns: {
        paths: [".morro/changesets/" + C.successor + ".json", C.productPath],
      },
    },
    leaseRegistry: {
      leases: { old: { changeSetId: C.predecessor, state: "RELEASED" } },
    },
    sourceIdentity: {
      workspace: C.nativeHome + "/worktrees/" + C.predecessorDirectory,
      headSha: C.preservedSha,
      productBlob: C.productBlob,
    },
    workspace: g.workspace,
    grant: g,
  };
}
for (const [name, mutate, code] of [
  [
    "unreleased expired lease",
    (f) => (f.leaseRegistry.leases.old.state = "ACTIVE"),
    /LEASE_NOT_RELEASED/,
  ],
  [
    "EXPIRED is not RELEASED",
    (f) => (f.leaseRegistry.leases.old.state = "EXPIRED"),
    /LEASE_NOT_RELEASED/,
  ],
  [
    "missing leases",
    (f) => (f.leaseRegistry.leases = {}),
    /LEASE_NOT_RELEASED/,
  ],
  ["expanded path", (f) => f.successor.owns.paths.push("apps/**"), /PATHS/],
  [
    "wrong workspace",
    (f) => (f.workspace = "/workspace/recovery"),
    /WORKSPACE_BINDING/,
  ],
  [
    "wrong source workspace",
    (f) => (f.sourceIdentity.workspace = "/workspace/old"),
    /PREDECESSOR_WORKSPACE/,
  ],
  [
    "preserved candidate as handoff",
    (f) => (f.handoff.candidateSha = C.preservedSha),
    /HANDOFF_SHA/,
  ],
  ["wrong candidate", (f) => (f.sourceIdentity.headSha = sha), /PRESERVED_SHA/],
  [
    "changed product",
    (f) => (f.sourceIdentity.productBlob = sha),
    /PRODUCT_BLOB/,
  ],
])
  test("P2 boundary rejects " + name, () => {
    const f = inputFixture();
    mutate(f);
    assert.throws(() => validateCssCorrectionInputs(f), code);
  });

storageTest(
  "provider-time input mutation cannot publish a conventional successor",
  (f) => {
    let calls = 0;
    assert.throws(
      () =>
        persistCssCorrection({
          ...f.args,
          revalidate: () => {
            if (++calls === 2) writeFileSync(f.predecessor, '{"changed":true}');
          },
        }),
      /INPUT_CHANGED/,
    );
    assert.equal(existsSync(f.args.stateDir), false);
  },
);
storageTest(
  "prepared-byte corruption cannot publish a conventional successor",
  (f) => {
    let calls = 0;
    assert.throws(
      () =>
        persistCssCorrection({
          ...f.args,
          revalidate: () => {
            if (++calls === 2)
              writeFileSync(
                join(
                  f.args.stateDir + ".correction-pending",
                  C.successor + ".task.json",
                ),
                "{}",
              );
          },
        }),
      /PREPARED_READBACK/,
    );
    assert.equal(existsSync(f.args.stateDir), false);
    assert.deepEqual(readFileSync(f.predecessor), f.bytes);
  },
);
storageTest("last local freshness failure remains before publication", (f) => {
  assert.throws(
    () =>
      persistCssCorrection({
        ...f.args,
        revalidate: () => () => {
          throw Error("EXPIRED_BEFORE_PUBLICATION");
        },
      }),
    /EXPIRED_BEFORE_PUBLICATION/,
  );
  assert.equal(existsSync(f.args.stateDir), false);
  assert.deepEqual(readFileSync(f.predecessor), f.bytes);
});

// Hermetic composition: real Git worktrees, real lifecycle/reanchor/authority
// validators and real atomic storage. Only immutable subject fixture anchors
// (paths/hashes) in a disposable copy of the profile are substituted. No gate,
// function or token factory is mocked; the gh executable is GET-only and local.
const controllerSource =
  '#!/usr/bin/env bash\nset -euo pipefail\n\nREPO_URL="${TDP_REPO_URL:-https://github.com/luizanunciostoca/touristic-digital-platform.git}"\nSTORE="${TDP_BARE_STORE:-$HOME/repos/touristic-digital-platform.git}"\nROOT="${TDP_WORKTREE_ROOT:-$HOME/worktrees}"\nMETA_ROOT="${TDP_WORKTREE_META_ROOT:-$ROOT/.morro-meta}"\nDEFAULT_BRANCH="${TDP_DEFAULT_BRANCH:-main}"\nLOCK_DIR="${STORE}.morro-lock"\n\nfail() {\n  echo "${1:-TDP_WORKTREE_ERROR}" >&2\n  exit "${2:-1}"\n}\n\nrequire_token() {\n  [[ "${1:-}" =~ ^[A-Za-z0-9._-]+$ ]] || fail "IDENTIFIER_INVALID:${1:-}"\n}\n\nrequire_ref() {\n  [[ "${1:-}" =~ ^[A-Za-z0-9._/-]+$ ]] || fail "REF_INVALID:${1:-}"\n  [[ "${1:-}" != *".."* ]] || fail "REF_TRAVERSAL_DENIED"\n}\n\ngit_store() {\n  git --git-dir="$STORE" "$@"\n}\nrelease_lock() {\n  rm -rf "$LOCK_DIR"\n}\n\nacquire_lock() {\n  mkdir -p "$(dirname "$STORE")"\n  if ! mkdir "$LOCK_DIR" 2>/dev/null; then\n    fail "WORKTREE_STORE_BUSY" 75\n  fi\n  printf \'pid=%s\\nutc=%s\\n\' "$$" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$LOCK_DIR/owner"\n  trap release_lock EXIT INT TERM\n}\n\nensure_store() {\n  [[ -d "$STORE" ]] || fail "BARE_STORE_MISSING"\n  [[ "$(git_store rev-parse --is-bare-repository)" == "true" ]] ||\n    fail "BARE_STORE_INVALID"\n  git_store remote get-url origin >/dev/null 2>&1 || fail "ORIGIN_MISSING"\n}\n\nfetch_main() {\n  git_store fetch --filter=blob:none --prune origin     "+refs/heads/$DEFAULT_BRANCH:refs/heads/$DEFAULT_BRANCH"\n}\n\nbootstrap() {\n  mkdir -p "$(dirname "$STORE")" "$ROOT" "$META_ROOT"\n  acquire_lock\n  if [[ ! -d "$STORE" ]]; then\n    git init --bare "$STORE" >/dev/null\n  fi\n  if git_store remote get-url origin >/dev/null 2>&1; then\n    git_store remote set-url origin "$REPO_URL"\n  else\n    git_store remote add origin "$REPO_URL"\n  fi\n  git_store config remote.origin.promisor true\n  git_store config remote.origin.partialclonefilter blob:none\n  git_store config remote.origin.fetch     "+refs/heads/$DEFAULT_BRANCH:refs/heads/$DEFAULT_BRANCH"\n  fetch_main\n  git_store symbolic-ref HEAD "refs/heads/$DEFAULT_BRANCH"\n  echo "state=READY"\n  echo "store=$STORE"\n  echo "main=$(git_store rev-parse "refs/heads/$DEFAULT_BRANCH")"\n}\n\nrefresh() {\n  ensure_store\n  acquire_lock\n  fetch_main\n  echo "main=$(git_store rev-parse "refs/heads/$DEFAULT_BRANCH")"\n}\n\ncreate_worktree() {\n  local task="${1:-}" lease="${2:-}" ref="${3:-}" expected="${4:-}"\n  require_token "$task"\n  require_token "$lease"\n  require_ref "$ref"\n  [[ -z "$expected" || "$expected" =~ ^[0-9a-f]{40}$ ]] ||\n    fail "EXPECTED_SHA_INVALID"\n  ensure_store\n  acquire_lock\n  mkdir -p "$ROOT" "$META_ROOT"\n  git_store fetch --filter=blob:none origin "$ref" >/dev/null\n  local sha path name\n  sha="$(git_store rev-parse \'FETCH_HEAD^{commit}\')"\n  [[ -z "$expected" || "$sha" == "$expected" ]] ||\n    fail "EXACT_SHA_MISMATCH:expected=$expected:observed=$sha" 42\n  name="${task}-${lease}-${sha:0:12}"\n  path="$ROOT/$name"\n  [[ ! -e "$path" ]] || fail "WORKTREE_REUSE_FORBIDDEN:$path" 43\n  git_store worktree add --detach "$path" "$sha" >/dev/null\n  printf \'{"task":"%s","lease":"%s","sha":"%s","ref":"%s","path":"%s","createdAt":"%s"}\\n\'     "$task" "$lease" "$sha" "$ref" "$path" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"     >"$META_ROOT/$name.json"\n  echo "state=CREATED"\n  echo "path=$path"\n  echo "sha=$sha"\n}\n\nretire_worktree() {\n  local input="${1:-}"\n  [[ -n "$input" ]] || fail "WORKTREE_PATH_REQUIRED"\n  ensure_store\n  acquire_lock\n  local path root_real name dirty\n  root_real="$(realpath -m "$ROOT")"\n  path="$(realpath -m "$input")"\n  [[ "$path" == "$root_real/"* ]] || fail "WORKTREE_PATH_OUTSIDE_ROOT"\n  [[ -d "$path" ]] || fail "WORKTREE_MISSING:$path"\n  name="$(basename "$path")"\n  dirty="$(git -C "$path" status --porcelain --untracked-files=all)"\n  if [[ -n "$dirty" ]]; then\n    mkdir -p "$META_ROOT/quarantine"\n    printf \'{"state":"QUARANTINED","path":"%s","observedAt":"%s"}\\n\'       "$path" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"       >"$META_ROOT/quarantine/$name.json"\n    echo "state=QUARANTINED"\n    echo "path=$path"\n    return 3\n  fi\n  git_store worktree remove "$path"\n  rm -f "$META_ROOT/$name.json"\n  git_store worktree prune\n  echo "state=RETIRED"\n  echo "path=$path"\n}\n\ncompact_local_refs() {\n  ensure_store\n  acquire_lock\n  local protected ref\n  protected="refs/heads/$DEFAULT_BRANCH"\n  while IFS= read -r ref; do\n    [[ "$ref" == "$protected" ]] && continue\n    if git_store worktree list --porcelain | grep -Fxq "branch $ref"; then\n      continue\n    fi\n    git_store update-ref -d "$ref"\n  done < <(git_store for-each-ref --format=\'%(refname)\' refs/heads)\n  git_store worktree prune\n  echo "state=COMPACTED"\n  echo "localHeads=$(git_store for-each-ref --format=\'%(refname)\' refs/heads | wc -l)"\n}\n\nstatus_store() {\n  ensure_store\n  echo "state=READY"\n  echo "store=$STORE"\n  echo "main=$(git_store rev-parse "refs/heads/$DEFAULT_BRANCH")"\n  echo "localHeads=$(git_store for-each-ref --format=\'%(refname)\' refs/heads | wc -l)"\n  git_store worktree list --porcelain\n}\n\nusage() {\n  cat <<\'EOF\'\nusage: tdp-worktreectl.sh <command> [args]\n  bootstrap\n  refresh\n  create <task-id> <lease-id> <remote-ref> [expected-sha]\n  retire <worktree-path>\n  compact-local-refs\n  status\nEOF\n}\n\ncase "${1:-}" in\n  bootstrap) bootstrap ;;\n  refresh) refresh ;;\n  create) shift; create_worktree "$@" ;;\n  retire) shift; retire_worktree "$@" ;;\n  compact-local-refs) compact_local_refs ;;\n  status) status_store ;;\n  *) usage; exit 64 ;;\nesac\n';
async function composedFixture(mode, action) {
  const { buildTaskStart, buildTaskTest, buildTaskSubmit } =
    await import("../mdctl/task-lifecycle.mjs");
  const { buildClaimReanchor } = await import("../mdctl/claim-lifecycle.mjs");
  const dir = mkdtempSync(join(tmpdir(), "css-composed-")),
    home = join(dir, "home");
  const root = join(home, "worktrees/controller"),
    common = join(home, "repos/touristic-digital-platform.git"),
    seedRoot = join(dir, "seed");
  const git = (w, ...args) =>
    execFileSync("git", ["-C", w, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const commit = (w) => {
    git(w, "add", ".");
    git(
      w,
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "fixture",
    );
    return git(w, "rev-parse", "HEAD");
  };
  const put = (p, v) => {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, typeof v === "string" ? v : JSON.stringify(v));
  };
  try {
    mkdirSync(seedRoot, { recursive: true });
    cpSync(
      fileURLToPath(new URL("..", import.meta.url)),
      join(seedRoot, "tooling"),
      { recursive: true },
    );
    assert.deepEqual(
      readFileSync(
        join(seedRoot, "tooling/mdctl/css-entry-order-correction-runtime.mjs"),
      ),
      readFileSync(
        new URL(
          "../mdctl/css-entry-order-correction-runtime.mjs",
          import.meta.url,
        ),
      ),
    );
    git(seedRoot, "init", "-q", "-b", "main");
    const retiredPath = ".morro/changesets/" + C.retiredSuccessor + ".json";
    const retiredManifest = JSON.parse(
      readFileSync(new URL("../../" + retiredPath, import.meta.url), "utf8"),
    );
    const retiredLedger =
      readFileSync(
        new URL("../../.github/morro-control/events.ndjson", import.meta.url),
        "utf8",
      )
        .split("\n")
        .filter(
          (line) =>
            line &&
            JSON.parse(line).entity === C.retiredSuccessor &&
            JSON.parse(line).payload?.reason === "EXPIRED",
        )
        .join("\n") + "\n";
    assert.ok(retiredLedger.trim(), "canonical retirement fixture missing");
    put(join(seedRoot, retiredPath), retiredManifest);
    put(join(seedRoot, ".github/morro-control/events.ndjson"), retiredLedger);
    const seed = commit(seedRoot);
    mkdirSync(dirname(common), { recursive: true });
    execFileSync("git", ["clone", "--bare", "--quiet", seedRoot, common]);
    mkdirSync(dirname(root), { recursive: true });
    git(common, "worktree", "add", "--quiet", root, "main");
    const source = join(home, "worktrees", C.predecessorDirectory),
      workspace = join(
        home,
        "worktrees",
        C.successor + "-fixture-lease-0001-" + seed.slice(0, 12),
      );
    git(
      common,
      "worktree",
      "add",
      "--quiet",
      "-b",
      "fixture-predecessor",
      source,
      seed,
    );
    const manifest = JSON.parse(
      readFileSync(
        new URL(
          "../../.morro/changesets/MD-CSS-ENTRY-ORDER-SUCCESSION-AUTHORITY-20261025.json",
          import.meta.url,
        ),
      ),
    );
    Object.assign(manifest, {
      id: C.predecessor,
      branch: "fixture-predecessor",
      baseSha: seed,
      scope: "DESTINATION:MORRO",
    });
    manifest.owns.paths = [
      ".morro/changesets/" + C.predecessor + ".json",
      C.productPath,
    ];
    put(join(source, manifest.owns.paths[0]), manifest);
    put(join(source, C.productPath), "fixture product bytes\n");
    const handoffSha = commit(source);
    const identity = {
      headSha: handoffSha,
      treeSha: git(source, "rev-parse", "HEAD^{tree}"),
      branch: manifest.branch,
      baseIsAncestor: true,
      dirty: false,
    };
    const now = Math.floor(Date.now() / 1000) * 1000,
      stamp = (n) => new Date(now + n).toISOString();
    let serial = 0;
    const started = buildTaskStart({
      changeSet: manifest,
      owner: C.executor,
      identity,
      now: stamp(-3000),
      idFactory: () => "fixture-" + ++serial,
    });
    const tested = await buildTaskTest({
      task: started.task,
      changeSet: manifest,
      leaseRegistry: started.leaseRegistry,
      identity,
      now: stamp(-2000),
      commandRunner: async () => ({
        status: "PASS",
        stdout: "fixture",
        stderr: "",
      }),
    });
    const submitted = buildTaskSubmit({
      task: tested.task,
      changeSet: manifest,
      leaseRegistry: started.leaseRegistry,
      identity,
      now: stamp(-1000),
    });
    const sourceState = git(source, "rev-parse", "--git-path", "morro-control");
    const values = {
      [C.predecessor + ".task.json"]: submitted.task,
      [C.predecessor + ".handoff.json"]: submitted.handoff,
      [C.predecessor + ".context-pack.json"]: tested.contextPack,
      "capability-leases.json": submitted.leaseRegistry,
    };
    for (const [name, v] of Object.entries(values))
      put(join(sourceState, name), v);
    put(join(source, manifest.owns.paths[0]), {
      ...manifest,
      state: "LOCAL_PROVEN",
    });
    const preservedSha = commit(source);
    const pins = {
      retirementSha: seed,
      retiredManifestBlob: git(seedRoot, "rev-parse", seed + ":" + retiredPath),
      retirementLedgerBlob: git(
        seedRoot,
        "rev-parse",
        seed + ":.github/morro-control/events.ndjson",
      ),
      nativeHome: home,
      nativeBin: "/usr/bin",
      gitRemote: "file://" + seedRoot,
      taskDigest: correctionDigest(submitted.task),
      handoffDigest: submitted.handoff.digest,
      manifestDigest: submitted.task.changeSetDigest,
      handoffSha,
      preservedSha,
      productBlob: git(source, "rev-parse", "HEAD:" + C.productPath),
    };
    const ap = join(root, "tooling/mdctl/task-correction-authority.mjs");
    let code = readFileSync(ap, "utf8");
    for (const [k, v] of Object.entries(pins)) {
      assert.ok(code.includes(JSON.stringify(C[k])));
      code = code.replace(JSON.stringify(C[k]), JSON.stringify(v));
    }
    writeFileSync(ap, code);
    const successor = {
      ...structuredClone(manifest),
      id: C.successor,
      branch: C.branch,
    };
    successor.owns.paths = [
      ".morro/changesets/" + C.successor + ".json",
      C.productPath,
    ];
    const claim = {
      owner: C.owner,
      reviewer: "AUTOMATED-INDEPENDENT-PROOF",
      baseSha: seed,
      branch: C.branch,
      paths: successor.owns.paths,
      domains: ["control-plane"],
      risk: "P0",
      status: "IMPLEMENTING",
      expiresAt: stamp(600000),
    };
    const registry = {
      registryAuthority: "ORCHESTRATOR",
      claims: { [C.successor]: claim },
    };
    const rp = ".github/morro-control/claims.json",
      ep = ".github/morro-control/events.ndjson",
      mp = successor.owns.paths[0];
    put(join(root, mp), successor);
    put(join(root, rp), registry);
    put(join(root, ep), "");
    const g = {
      ...grant(),
      ...Object.fromEntries(
        ["taskDigest", "handoffDigest", "manifestDigest"].map((k) => [
          k,
          pins[k],
        ]),
      ),
      workspace,
      issuedAt: stamp(-2000),
      expiresAt: stamp(600000),
      envelopeDigest: correctionDigest(correctionEnvelope(successor)),
      claimDigest: correctionDigest(correctionClaim(claim)),
    };
    g.provisioningLease = lease(g, seed);
    const key = correctionKey(g.handoffDigest, C.successor);
    put(join(root, C.path), g);
    const issued = commit(root);
    let main = issued;
    let stateDir = "";
    const controller = join(
      home,
      "morro-termux-control/scripts/tdp-worktreectl.sh",
    );
    put(controller, controllerSource);
    assert.equal(git(root, "hash-object", controller), C.controllerBlobSha);
    git(common, "remote", "set-url", "origin", "file://" + seedRoot);
    const blob = (v, raw = false) => {
      const data = Buffer.from(raw ? v : JSON.stringify(v));
      return {
        type: "file",
        encoding: "base64",
        content: data.toString("base64"),
        sha: execFileSync("git", ["hash-object", "--stdin"], {
          input: data,
          encoding: "utf8",
        }).trim(),
      };
    };
    const prefix = "repos/" + C.repository;
    const responses = {};
    const configure = () => {
      for (const key of Object.keys(responses)) delete responses[key];
      responses[prefix + "/commits/main"] = { sha: main };
      const commits = git(root, "log", "--format=%H", main, "--", C.path).split(
        "\n",
      );
      responses[
        prefix +
          "/commits?sha=" +
          main +
          "&path=" +
          encodeURIComponent(C.path) +
          "&per_page=100&page=1"
      ] = commits.map((sha) => ({ sha }));
      for (const sha of new Set([...commits, main]))
        responses[prefix + "/contents/" + C.path + "?ref=" + sha] = blob(
          JSON.parse(git(root, "show", sha + ":" + C.path)),
        );
      responses[prefix + "/contents/" + rp + "?ref=" + main] = blob(registry);
      responses[prefix + "/contents/" + mp + "?ref=" + main] = blob(successor);
      responses[prefix + "/contents/" + retiredPath + "?ref=" + seed] =
        blob(retiredManifest);
      responses[prefix + "/contents/" + retiredPath + "?ref=" + main] =
        blob(retiredManifest);
      responses[prefix + "/contents/" + ep + "?ref=" + seed] = blob(
        retiredLedger,
        true,
      );
      const legacyHistory =
        prefix +
        "/commits?sha=" +
        main +
        "&path=" +
        encodeURIComponent(
          ".morro/task-corrections/" + C.retiredSuccessor + ".json",
        ) +
        "&per_page=100&page=1";
      responses[legacyHistory] = [];
      if (
        mode === "provision-retired-grant" ||
        mode === "provision-retired-deleted-grant"
      )
        responses[legacyHistory] = [{ sha: seed }];
      if (mode === "provision-retired-api") delete responses[legacyHistory];
      if (mode === "provision-retired-claim")
        responses[prefix + "/contents/" + rp + "?ref=" + main] = blob({
          ...registry,
          claims: { ...registry.claims, [C.retiredSuccessor]: claim },
        });
      if (mode === "provision-retired-manifest")
        responses[prefix + "/contents/" + retiredPath + "?ref=" + seed] = blob({
          ...retiredManifest,
          state: "MERGED",
        });
      if (mode === "provision-retired-ledger")
        responses[prefix + "/contents/" + ep + "?ref=" + seed] = blob(
          "{}\n",
          true,
        );
      if (mode === "provision-retired-current-manifest")
        responses[prefix + "/contents/" + retiredPath + "?ref=" + main] = blob({
          ...retiredManifest,
          state: "MERGED",
        });
      for (const [base, head] of [
        [seed, seed],
        [seed, main],
        [seed, issued],
        [issued, main],
      ]) {
        responses[prefix + "/commits/" + base] = {
          sha: git(root, "rev-parse", base + "^{commit}"),
        };
        responses[prefix + "/compare/" + base + "..." + head] = {
          base_commit: { sha: base },
          merge_base_commit: { sha: git(root, "merge-base", base, head) },
          status: base === head ? "identical" : "ahead",
        };
      }
    };
    configure();
    const cfg = join(dir, "provider.json"),
      calls = join(dir, "calls"),
      bin = join(dir, "bin");
    mkdirSync(bin);
    put(cfg, {
      responses,
      mode: mode.startsWith("provision-") ? mode : "success",
      calls,
      source,
      sourceState,
      stateDir,
      handoffSha,
      workspace,
    });
    put(
      join(bin, "gh"),
      `#!/usr/bin/env node
const fs=require('node:fs'),cp=require('node:child_process'),p=require('node:path');const c=JSON.parse(fs.readFileSync(${JSON.stringify(cfg)}));const a=process.argv.slice(2),target=a.find(x=>x.startsWith('repos/'));if(a[a.indexOf('--method')+1]!=='GET'||!Object.hasOwn(c.responses,target))process.exit(2);
if(c.mode==='provision-ancestry'&&target.includes('/compare/')){c.responses[target].merge_base_commit.sha='f'.repeat(40);}
if(target.endsWith('/commits/main')){const n=(fs.existsSync(c.calls)?Number(fs.readFileSync(c.calls)):0)+1;fs.writeFileSync(c.calls,String(n));
 if((n===3&&c.mode==='provision-before')||(n===7&&c.mode==='provision-after'))process.exit(3);
 if(n===7&&c.mode==='provision-receipt')fs.appendFileSync(p.join(p.dirname(c.workspace),'.morro-meta',p.basename(c.workspace)+'.json'),' ');
 if(n===4&&c.mode==='bind-retired-drift')fs.mkdirSync(p.join(p.dirname(c.workspace),'${C.retiredSuccessor}-late'));
 if(n===5&&c.mode==='bind-after')process.exit(3);
 if(n===7&&c.mode==='bind-final-drift')fs.appendFileSync(p.join(p.dirname(c.workspace),'.morro-meta',p.basename(c.workspace)+'.json'),' ');
 if(n===6){if(c.mode==='provider-failure')process.exit(3);if(c.mode==='branch-drift')cp.execFileSync('git',['-C',c.workspace,'switch','-c','fixture-other']);if(c.mode==='identity-drift')cp.execFileSync('git',['-C',c.source,'update-ref','refs/heads/fixture-predecessor',c.handoffSha]);if(c.mode==='input-drift')fs.appendFileSync(p.join(c.sourceState,'${C.predecessor}.task.json'),' ');if(c.mode==='receipt-drift')fs.appendFileSync(p.join(p.dirname(c.workspace),'.morro-meta',p.basename(c.workspace)+'.json'),' ');if(c.mode==='journal-drift'){const common=cp.execFileSync('git',['-C',c.workspace,'rev-parse','--git-common-dir'],{encoding:'utf8'}).trim();const name=fs.readdirSync(common).find(x=>x.startsWith('css-entry-order-provisioning-'));fs.appendFileSync(p.join(common,name),' ');}if(c.mode==='prepared-drift')fs.writeFileSync(p.join(c.stateDir+'.correction-pending','${C.successor}.task.json'),'{}');}}
process.stdout.write(JSON.stringify(c.responses[target]));`,
    );
    execFileSync("chmod", ["700", join(bin, "gh")]);
    const provisionScript = `
import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
const mode=${JSON.stringify(mode)};
if(mode.startsWith('provision-fsync-')){const original=fs.fsyncSync;let count=0;fs.fsyncSync=(fd)=>{if(++count===Number(mode.split('-').at(-1)))throw Object.assign(new Error('fixture fsync'),{code:'EIO'});return original(fd)};syncBuiltinESMExports();}
if(mode==='provision-rename'){fs.renameSync=()=>{throw Object.assign(new Error('fixture rename'),{code:'EIO'})};syncBuiltinESMExports();}
const {prepareCssCorrectionWorkspace}=await import(${JSON.stringify(pathToFileURL(join(root, "tooling/mdctl/css-entry-order-correction-runtime.mjs")).href)});
try{console.log(JSON.stringify(prepareCssCorrectionWorkspace(${JSON.stringify({ root, expectedMain: issued })})));}catch(e){console.log(JSON.stringify({error:e.message}));process.exitCode=2;}`;
    const provisionArgs = ["--input-type=module", "-e", provisionScript],
      provisionOptions = {
        encoding: "utf8",
        timeout: 30000,
        env: {
          ...process.env,
          PATH: bin + ":" + process.env.PATH,
          TDP_WORKTREE_ROOT: join(dir, "forbidden"),
        },
      };
    const provisionRun = () =>
      spawnSync(process.execPath, provisionArgs, provisionOptions);
    const provisionAsync = () =>
      new Promise((resolve, reject) => {
        const child = spawn(process.execPath, provisionArgs, provisionOptions);
        let stdout = "",
          stderr = "";
        child.stdout.on("data", (b) => (stdout += b));
        child.stderr.on("data", (b) => (stderr += b));
        child.on("error", reject);
        child.on("close", (status) => resolve({ status, stdout, stderr }));
      });
    if (mode === "provision-retired-lease-schema")
      put(join(sourceState, "capability-leases.json"), {});
    if (mode === "provision-retired-lease") {
      const leases = JSON.parse(
        readFileSync(join(sourceState, "capability-leases.json")),
      );
      Object.values(leases.leases)[0].changeSetId = C.retiredSuccessor;
      put(join(sourceState, "capability-leases.json"), leases);
    }
    const predecessorBefore = Object.keys(values).map((name) => ({
      path: join(sourceState, name),
      bytes: readFileSync(join(sourceState, name)),
    }));
    if (mode === "provision-lock")
      mkdirSync(join(common, "css-started-transfer.lock"));
    if (mode === "provision-controller")
      writeFileSync(controller, controllerSource + "\n");
    if (mode === "provision-race") {
      const results = await Promise.all([provisionAsync(), provisionAsync()]);
      for (const e of predecessorBefore)
        assert.deepEqual(readFileSync(e.path), e.bytes);
      await action({ results, workspace, common, key });
      return;
    }
    if (mode === "provision-retired-workspace")
      mkdirSync(join(home, "worktrees", C.retiredSuccessor + "-old"));
    if (mode === "provision-retired-receipt")
      put(
        join(home, "worktrees/.morro-meta", C.retiredSuccessor + "-old.json"),
        {},
      );
    if (mode === "provision-retired-task")
      put(join(sourceState, C.retiredSuccessor + ".task.json"), {
        state: "STARTED",
      });
    if (mode === "provision-retired-journal")
      put(join(common, "css-entry-order-provisioning-" + key + ".json"), {
        state: "RESERVED",
      });
    if (mode === "provision-retired-execution")
      put(join(common, "css-entry-order-correction-" + key + ".json"), {
        state: "COMPLETED",
      });
    const provisionResult = provisionRun();
    for (const e of predecessorBefore)
      assert.deepEqual(readFileSync(e.path), e.bytes);
    if (mode.startsWith("provision-")) {
      await action({
        provisionResult,
        workspace,
        common,
        issued,
        key,
        sourceState,
        provisionRun,
      });
      return;
    }
    assert.equal(
      provisionResult.status,
      0,
      provisionResult.stdout + provisionResult.stderr,
    );
    assert.equal(
      JSON.parse(provisionResult.stdout).state,
      "WORKSPACE_PROVISIONED_CONSUMPTION_REVIEW_REQUIRED",
      provisionResult.stdout,
    );
    assert.equal(existsSync(join(dir, "forbidden")), false);
    assert.equal(git(workspace, "branch", "--show-current"), "");
    const premature = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import {prepareCssEntryOrderCorrection} from ${JSON.stringify(pathToFileURL(join(root, "tooling/mdctl/css-entry-order-correction-runtime.mjs")).href)};try{await prepareCssEntryOrderCorrection(${JSON.stringify({ root, workspace, expectedMain: issued })});process.exitCode=9;}catch(e){console.log(e.message);process.exitCode=2;}`,
      ],
      provisionOptions,
    );
    assert.equal(premature.status, 2);
    assert.match(premature.stdout, /PROVISION_CONSUMPTION_REQUIRED/);
    const receiptFile = join(
        home,
        "worktrees/.morro-meta",
        workspace.split("/").at(-1) + ".json",
      ),
      rawReceipt = JSON.parse(readFileSync(receiptFile));
    const { createHash } = await import("node:crypto");
    const receiptSha256 = createHash("sha256")
      .update(readFileSync(receiptFile))
      .digest("hex");
    const cg = {
      ...g,
      state: "CONSUMED",
      reservation: {
        key,
        commitSha: issued,
        issuedCommitSha: issued,
        provisioningReceipt: receipt(g, {
          commonDir: common,
          createdAt: rawReceipt.createdAt,
          verifiedAt: new Date().toISOString(),
          receiptSha256,
        }),
      },
    };
    put(join(root, C.path), cg);
    main = commit(root);
    const coordinator = join(dir, "coordinator");
    git(common, "worktree", "add", "--quiet", "--detach", coordinator, main);
    const reanchor = buildClaimReanchor({
      registry,
      ledgerText: "",
      manifest: successor,
      newBaseSha: main,
      observedAt: stamp(0),
    });
    put(join(coordinator, mp), reanchor.manifest);
    put(join(coordinator, rp), reanchor.registry);
    put(join(coordinator, ep), reanchor.ledgerText);
    if (mode === "bind-path")
      put(join(coordinator, "forbidden-product-file"), "not admitted");
    const candidateSha = mode === "bind-base" ? issued : commit(coordinator);
    configure();
    rmSync(calls, { force: true });
    put(cfg, {
      responses,
      mode: mode.startsWith("bind-") ? mode : "success",
      calls,
      source,
      sourceState,
      stateDir,
      handoffSha,
      workspace,
    });
    const bindRun = () =>
      spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import {bindCssCorrectionWorkspace} from ${JSON.stringify(pathToFileURL(join(root, "tooling/mdctl/css-entry-order-correction-runtime.mjs")).href)};try{console.log(JSON.stringify(bindCssCorrectionWorkspace(${JSON.stringify({ root, expectedMain: main, candidateSha })})));}catch(e){console.log(JSON.stringify({error:e.message}));process.exitCode=2;}`,
        ],
        provisionOptions,
      );
    const binding = bindRun();
    if (mode.startsWith("bind-")) {
      await action({ binding, bindRun, workspace, common, key });
      return;
    }
    assert.equal(binding.status, 0, binding.stdout + binding.stderr);
    assert.equal(
      JSON.parse(binding.stdout).state,
      "WORKSPACE_BOUND_TASK_PREPARATION_REQUIRED",
      binding.stdout,
    );
    stateDir = git(workspace, "rev-parse", "--git-path", "morro-control");
    rmSync(calls, { force: true });
    put(cfg, {
      responses,
      mode,
      calls,
      source,
      sourceState,
      stateDir,
      handoffSha,
      workspace,
    });
    const before = Object.keys(values).map((name) => ({
      path: join(sourceState, name),
      bytes: readFileSync(join(sourceState, name)),
    }));
    const run = () =>
      spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import {prepareCssEntryOrderCorrection} from ${JSON.stringify(pathToFileURL(join(root, "tooling/mdctl/css-entry-order-correction-runtime.mjs")).href)};try{console.log(JSON.stringify(await prepareCssEntryOrderCorrection(${JSON.stringify({ root, workspace, expectedMain: main })})));}catch(e){console.log(JSON.stringify({error:e.message}));process.exitCode=2;}`,
        ],
        {
          encoding: "utf8",
          timeout: 30000,
          env: { ...process.env, PATH: bin + ":" + process.env.PATH },
        },
      );
    await action({
      run,
      before,
      stateDir,
      source,
      sourceState,
      workspace,
      main,
      submitted,
      inputs: values,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
test("composed Native fixture crosses real gates, publishes once and preserves predecessor", async () =>
  composedFixture("success", (f) => {
    const r = f.run();
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(
      JSON.parse(r.stdout).state,
      "CORRECTION_PERSISTED_SCHEDULER_RECHECK_REQUIRED",
    );
    const task = JSON.parse(
      readFileSync(join(f.stateDir, C.successor + ".task.json")),
    );
    assert.equal(task.state, "STARTED");
    assert.equal(task.owner, C.executor);
    assert.equal(task.supersedes.handoffDigest, f.submitted.handoff.digest);
    for (const e of f.before) assert.deepEqual(readFileSync(e.path), e.bytes);
    const bytes = readFileSync(join(f.stateDir, C.successor + ".task.json"));
    const replay = f.run();
    assert.equal(replay.status, 2);
    assert.match(replay.stdout, /SUCCESSOR_STATE_EXISTS/);
    assert.deepEqual(
      readFileSync(join(f.stateDir, C.successor + ".task.json")),
      bytes,
    );
  }));
for (const [mode, code] of [
  ["provider-failure", /Command failed/],
  ["branch-drift", /TARGET_BRANCH_CHANGED/],
  ["identity-drift", /SOURCE_CHANGED/],
  ["input-drift", /INPUT_CHANGED/],
  ["prepared-drift", /PREPARED_READBACK/],
  ["receipt-drift", /INPUT_CHANGED/],
  ["journal-drift", /INPUT_CHANGED/],
])
  test("composed final " + mode + " cannot publish", async () =>
    composedFixture(mode, (f) => {
      const r = f.run();
      assert.equal(r.status, 2, r.stdout + r.stderr);
      assert.match(r.stdout, code);
      assert.equal(existsSync(f.stateDir), false);
      for (const e of f.before) {
        const expected =
          mode === "input-drift" && e.path.endsWith(".task.json")
            ? Buffer.concat([e.bytes, Buffer.from(" ")])
            : e.bytes;
        assert.deepEqual(readFileSync(e.path), expected);
      }
    }),
  );

for (const mode of [
  "provision-before",
  "provision-after",
  "provision-receipt",
  "provision-ancestry",
  "provision-lock",
  "provision-controller",
]) {
  test(mode + " fails closed without a conventional successor", async () =>
    composedFixture(mode, (f) => {
      const result = JSON.parse(f.provisionResult.stdout);
      assert.ok(
        result.error || result.state === "PROVISION_RECONCILIATION_REQUIRED",
        f.provisionResult.stdout,
      );
      const created = ["provision-after", "provision-receipt"].includes(mode);
      assert.equal(existsSync(f.workspace), created);
      if (created) {
        assert.equal(result.controllerAttempted, true);
        assert.equal(result.workspaceExists, true);
        const state = execFileSync(
          "git",
          ["-C", f.workspace, "rev-parse", "--git-path", "morro-control"],
          { encoding: "utf8" },
        ).trim();
        assert.equal(existsSync(state), false);
        assert.equal(
          JSON.parse(
            readFileSync(
              join(f.common, "css-entry-order-provisioning-" + f.key + ".json"),
            ),
          ).state,
          "RESERVED",
        );
      }
    }),
  );
}
test("provision replay preserves receipt and journal", async () =>
  composedFixture("provision-replay", (f) => {
    assert.equal(
      JSON.parse(f.provisionResult.stdout).state,
      "WORKSPACE_PROVISIONED_CONSUMPTION_REVIEW_REQUIRED",
    );
    const journal = join(
        f.common,
        "css-entry-order-provisioning-" + f.key + ".json",
      ),
      before = readFileSync(journal);
    const replay = f.provisionRun();
    assert.equal(replay.status, 2);
    assert.match(replay.stdout, /PROVISION_REUSE/);
    assert.deepEqual(readFileSync(journal), before);
  }));
for (const [name, mutate, pattern] of [
  [
    "lease scope",
    (g) => g.provisioningLease.actions.push("start-worker"),
    /ACTIONS/,
  ],
  [
    "lease executor",
    (g) => (g.provisioningLease.executor = "RECOVERY"),
    /BINDING/,
  ],
  ["lease task", (g) => (g.provisioningLease.taskId = "OTHER"), /TASK/],
  ["lease path", (g) => (g.provisioningLease.workspace += "-other"), /BINDING/],
  [
    "lease traversal",
    (g) => (g.provisioningLease.leaseId = "../other"),
    /LEASE_ID/,
  ],
  [
    "lease expiry",
    (g) => (g.provisioningLease.expiresAt = "2030-01-01"),
    /BINDING/,
  ],
  [
    "source prefix",
    (g) => (g.provisioningLease.sourceMainSha = "f".repeat(40)),
    /WORKSPACE/,
  ],
  ["lease unknown field", (g) => (g.provisioningLease.extra = true), /FIELDS/],
])
  test(name + " is rejected", () => {
    const g = grant();
    mutate(g);
    assert.throws(() => validateCorrectionGrant(g), pattern);
  });
for (const [name, mutate, pattern] of [
  [
    "arbitrary reservation",
    (g) => (g.reservation.commitSha = "f".repeat(40)),
    /RESERVATION_COMMIT/,
  ],
  [
    "receipt task",
    (g) => (g.reservation.provisioningReceipt.taskId = "OTHER"),
    /BINDING/,
  ],
  [
    "receipt lease",
    (g) => (g.reservation.provisioningReceipt.leaseId = "other-lease-001"),
    /BINDING/,
  ],
  [
    "receipt controller",
    (g) =>
      (g.reservation.provisioningReceipt.controllerBlobSha = "f".repeat(40)),
    /CONTROLLER/,
  ],
  [
    "receipt common dir",
    (g) => (g.reservation.provisioningReceipt.commonDir = "/tmp/other"),
    /COMMON/,
  ],
  [
    "receipt unknown field",
    (g) => (g.reservation.provisioningReceipt.extra = true),
    /FIELDS/,
  ],
  [
    "receipt unverifiable ID",
    (g) => (g.reservation.provisioningReceipt.nativeIssueNumber = 0),
    /ID/,
  ],
  [
    "receipt time",
    (g) => (g.reservation.provisioningReceipt.verifiedAt = g.expiresAt),
    /TIME/,
  ],
])
  test(name + " is rejected", () => {
    const g = history()[1].grant;
    mutate(g);
    assert.throws(() => validateCorrectionGrant(g), pattern);
  });
test("pure ISSUED history cannot mint provisioning authority", () => {
  const token = validateCorrectionHistory(
    [history()[0]],
    "2026-10-25T03:01:00Z",
  );
  assert.throws(() => assertCssProvisioningAuthority(token), /UNVERIFIED/);
});

test("two real provisioners admit at most one creation", async () =>
  composedFixture("provision-race", (f) => {
    const outcomes = f.results.map((r) => JSON.parse(r.stdout));
    assert.equal(
      outcomes.filter(
        (r) => r.state === "WORKSPACE_PROVISIONED_CONSUMPTION_REVIEW_REQUIRED",
      ).length,
      1,
      JSON.stringify(outcomes),
    );
    assert.equal(outcomes.filter((r) => r.error).length, 1);
    assert.equal(
      JSON.parse(
        readFileSync(
          join(f.common, "css-entry-order-provisioning-" + f.key + ".json"),
        ),
      ).state,
      "PROVISIONED",
    );
  }));
for (const mode of [
  "provision-fsync-1",
  "provision-fsync-3",
  "provision-fsync-4",
  "provision-rename",
])
  test(mode + " preserves uncertain state and lock", async () =>
    composedFixture(mode, (f) => {
      const r = JSON.parse(f.provisionResult.stdout);
      assert.equal(r.state, "PROVISION_RECONCILIATION_REQUIRED");
      assert.equal(r.reason, "EIO");
      assert.equal(
        existsSync(join(f.common, "css-started-transfer.lock")),
        true,
      );
      assert.equal(existsSync(f.workspace), mode !== "provision-fsync-1");
      if (mode === "provision-fsync-4")
        assert.equal(
          JSON.parse(
            readFileSync(
              join(f.common, "css-entry-order-provisioning-" + f.key + ".json"),
            ),
          ).state,
          "PROVISIONED",
        );
    }),
  );

test("CSS provisioning time uses controller second precision", () => {
  const g = grant();
  g.issuedAt = "2026-10-25T03:00:00.001Z";
  g.provisioningLease.issuedAt = g.issuedAt;
  assert.throws(() => validateCorrectionGrant(g), /SECOND_PRECISION/);
});

for (const mode of [
  "bind-path",
  "bind-base",
  "bind-after",
  "bind-final-drift",
  "bind-retired-drift",
])
  test(mode + " cannot publish a task", async () =>
    composedFixture(mode, (f) => {
      const r = JSON.parse(f.binding.stdout);
      assert.ok(
        r.error || r.state === "BINDING_RECONCILIATION_REQUIRED",
        f.binding.stdout,
      );
      const state = execFileSync(
        "git",
        ["-C", f.workspace, "rev-parse", "--git-path", "morro-control"],
        { encoding: "utf8" },
      ).trim();
      assert.equal(existsSync(state), false);
      const branch = execFileSync(
        "git",
        ["-C", f.workspace, "branch", "--show-current"],
        { encoding: "utf8" },
      ).trim();
      assert.equal(
        branch,
        ["bind-after", "bind-final-drift"].includes(mode) ? C.branch : "",
      );
      if (branch)
        assert.equal(
          existsSync(join(f.common, "css-started-transfer.lock")),
          true,
        );
    }),
  );
test("bound journal cannot be rebound or silently replayed", async () =>
  composedFixture("bind-replay", (f) => {
    assert.equal(
      JSON.parse(f.binding.stdout).state,
      "WORKSPACE_BOUND_TASK_PREPARATION_REQUIRED",
    );
    const before = readFileSync(
      join(f.common, "css-entry-order-provisioning-" + f.key + ".json"),
    );
    const again = f.bindRun();
    assert.equal(again.status, 2);
    assert.match(again.stdout, /PROVISION_JOURNAL/);
    assert.deepEqual(
      readFileSync(
        join(f.common, "css-entry-order-provisioning-" + f.key + ".json"),
      ),
      before,
    );
  }));

for (const mode of [
  "grant",
  "deleted-grant",
  "lease",
  "lease-schema",
  "api",
  "claim",
  "manifest",
  "ledger",
  "current-manifest",
  "workspace",
  "receipt",
  "task",
  "journal",
  "execution",
])
  test(
    "retired successor evidence rejects " +
      mode +
      " before workspace publication",
    async () =>
      composedFixture("provision-retired-" + mode, (f) => {
        const result = JSON.parse(f.provisionResult.stdout);
        assert.ok(
          result.error || result.state === "PROVISION_RECONCILIATION_REQUIRED",
          f.provisionResult.stdout,
        );
        assert.equal(existsSync(f.workspace), false);
      }),
  );

test("replacement is one fixed profile and preserves the predecessor replay key", () => {
  assert.equal(C.successor, "MD-CSS-ENTRY-ORDER-CORRECTION-R2-20261027");
  assert.equal(C.retiredSuccessor, "MD-CSS-ENTRY-ORDER-CORRECTION-20261025");
  const oldFormula = createHash("sha256")
    .update(C.repository + "\n" + C.predecessor + "\n" + C.handoffDigest)
    .digest("hex");
  assert.equal(correctionKey(C.handoffDigest, C.successor), oldFormula);
  assert.throws(() =>
    validateCorrectionGrant({ ...grant(), successor: C.retiredSuccessor }),
  );
  assert.throws(() =>
    validateCorrectionGrant({ ...grant(), successor: "MD-ARBITRARY" }),
  );
});

test("new fixed successor acquires canonically while retired manifest and ledger remain immutable", () => {
  const dir = mkdtempSync(join(tmpdir(), "p2-acquisition-"));
  const git = (...args) =>
    execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
  const put = (p, value) => {
    const dest = join(dir, p);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(
      dest,
      typeof value === "string" ? value : JSON.stringify(value),
    );
  };
  const commit = () => {
    git("add", ".");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "fixture",
    );
    return git("rev-parse", "HEAD");
  };
  try {
    git("init", "-q", "-b", C.branch);
    const oldPath = ".morro/changesets/" + C.retiredSuccessor + ".json",
      path = ".morro/changesets/" + C.successor + ".json";
    const old = readFileSync(
      new URL("../../" + oldPath, import.meta.url),
      "utf8",
    );
    const ledger = readFileSync(
      new URL("../../.github/morro-control/events.ndjson", import.meta.url),
      "utf8",
    );
    const registry = {
      schemaVersion: 1,
      registryAuthority: "ORCHESTRATOR",
      claims: {},
    };
    put(oldPath, old);
    put(".github/morro-control/claims.json", registry);
    put(".github/morro-control/events.ndjson", ledger);
    const base = commit();
    const manifest = {
      ...JSON.parse(old),
      id: C.successor,
      baseSha: base,
      branch: C.branch,
    };
    manifest.owns.paths = [path, C.productPath];
    const transition = buildClaimAcquisition({
      registry,
      ledgerText: ledger,
      manifest,
      domains: ["control-plane"],
      observedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    });
    put(path, manifest);
    put(".github/morro-control/claims.json", transition.registry);
    put(".github/morro-control/events.ndjson", transition.ledgerText);
    const head = commit();
    assert.ok(git("diff", "--name-status", base, head).includes("A\t" + path));
    assert.equal(readFileSync(join(dir, oldPath), "utf8"), old);
    assert.ok(transition.ledgerText.startsWith(ledger));
    assert.equal(
      Object.hasOwn(transition.registry.claims, C.retiredSuccessor),
      false,
    );
    const proof = buildClaimGuardProof(dir, {
      EXPECTED_BASE_SHA: base,
      EXPECTED_CANDIDATE_SHA: head,
      EXPECTED_BRANCH: C.branch,
      MANIFEST_PATH: path,
      CLAIM_GUARD_AUTHORITY: "ORCHESTRATOR",
    });
    assert.equal(proof.status, "pass");
    assert.equal(proof.acquisition, true);
    assert.equal(proof.collisions, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function cloudProposal() {
  return {
    schemaVersion: 1,
    kind: "TDP_CLOUD_CSS_ARTIFACT_RECOVERY",
    repository: CLOUD.repository,
    owner: CLOUD.owner,
    predecessor: CLOUD.predecessor,
    supersedes: CLOUD.supersedes,
    successor: CLOUD.successor,
    branch: CLOUD.branch,
    sourceMainSha: sha,
    originKey: correctionKey(C.handoffDigest, C.successor),
    claimDigest: hash,
    envelopeDigest: hash,
    workspace: {
      executor: "codex",
      path: "/workspace/css-cloud-fixture",
      headSha: sha,
      treeSha: sha,
    },
    nonce: "c".repeat(32),
    issuedAt: "2026-10-27T15:00:00.000Z",
    expiresAt: "2026-10-27T15:30:00.000Z",
    retirements: { product: "d".repeat(40), grant: "e".repeat(40) },
    approval: { issue: 1, comment: 2 },
    state: "ISSUED",
  };
}
test("cloud declaration remains distinct from every Native grant", () => {
  const p = cloudProposal();
  assert.equal(validateCloudCorrectionProposal(p), p);
  assert.throws(() => validateCorrectionGrant(p), /CORRECTION_GRANT_FIELDS/u);
  assert.throws(
    () => assertCorrectionAuthority({ proposal: p }, {}),
    /AUTHORITY_UNVERIFIED/u,
  );
  const body = cloudCorrectionApprovalBody(p);
  const q = structuredClone(p);
  q.approval.comment = 3;
  assert.equal(cloudCorrectionApprovalBody(q), body);
  q.nonce = "d".repeat(32);
  assert.notEqual(cloudCorrectionApprovalBody(q), body);
});
for (const [name, mutate] of [
  [
    "extra authority",
    (p) => {
      p.authorized = true;
    },
  ],
  [
    "Native executor",
    (p) => {
      p.workspace.executor = C.executor;
    },
  ],
  [
    "Native workspace",
    (p) => {
      p.workspace.path = C.nativeHome + "/worktrees/test";
    },
  ],
  [
    "traversal",
    (p) => {
      p.workspace.path = "/workspace/../tmp";
    },
  ],
  [
    "extended window",
    (p) => {
      p.expiresAt = "2026-10-27T15:30:00.001Z";
    },
  ],
  [
    "normalized date",
    (p) => {
      p.issuedAt = "2026-02-30T15:00:00.000Z";
    },
  ],
  [
    "new origin",
    (p) => {
      p.originKey = "b".repeat(64);
    },
  ],
  [
    "workspace anchor",
    (p) => {
      p.workspace.headSha = "c".repeat(40);
    },
  ],
  [
    "same retirement",
    (p) => {
      p.retirements.grant = p.retirements.product;
    },
  ],
  [
    "unimplemented consumption",
    (p) => {
      p.state = "CONSUMED";
    },
  ],
  [
    "other successor",
    (p) => {
      p.successor += "-2";
    },
  ],
  [
    "unsafe approval",
    (p) => {
      p.approval.comment = Number.MAX_SAFE_INTEGER + 1;
    },
  ],
])
  test("cloud declaration rejects " + name, () => {
    const p = cloudProposal();
    mutate(p);
    assert.throws(() => validateCloudCorrectionProposal(p));
  });
test("cloud history rejects reissue, revocation, replay and changed approval", () => {
  const first = { commitSha: sha, proposal: cloudProposal() },
    now = "2026-10-27T15:10:00.000Z";
  assert.equal(
    validateCloudCorrectionHistory([first], now).issuedCommitSha,
    sha,
  );
  assert.throws(
    () => validateCloudCorrectionHistory([], now),
    /HISTORY_BOUND/u,
  );
  assert.throws(
    () => validateCloudCorrectionHistory(Array(33).fill(first), now),
    /HISTORY_BOUND/u,
  );
  assert.throws(
    () => validateCloudCorrectionHistory([first, first], now),
    /DUPLICATE/u,
  );
  const second = structuredClone(first);
  second.commitSha = "c".repeat(40);
  assert.throws(
    () => validateCloudCorrectionHistory([first, second], now),
    /REISSUE/u,
  );
  second.proposal.state = "REVOKED";
  assert.throws(
    () => validateCloudCorrectionHistory([first, second], now),
    /REVOKED/u,
  );
  second.proposal.approval.comment++;
  assert.throws(
    () => validateCloudCorrectionHistory([first, second], now),
    /APPROVAL_CHANGED/u,
  );
  second.proposal.nonce = "e".repeat(32);
  assert.throws(
    () => validateCloudCorrectionHistory([first, second], now),
    /CORE_CHANGED/u,
  );
  for (const instant of [
    "2026-10-27T14:59:59.999Z",
    "2026-10-27T15:30:00.000Z",
  ])
    assert.throws(
      () => validateCloudCorrectionHistory([first], instant),
      /EXPIRED_OR_FUTURE/u,
    );
});
test("cloud collector forbids caller clock and provider overrides before any read", () => {
  for (const extra of [
    { now: new Date().toISOString() },
    { api: () => ({}) },
    { authorized: true },
  ])
    assert.throws(
      () => collectCloudCorrectionProposal({ expectedMain: sha, ...extra }),
      /OPTIONS/u,
    );
});

// Disposable Git history and a GET-only gh executable. Immutable artifact pins
// alone are substituted in the copied subject; production validators are kept.
async function withCloudCollectorFixture(run, variant = "success") {
  const { buildClaimRetirement } = await import("../mdctl/claim-lifecycle.mjs");
  const dir = mkdtempSync(join(tmpdir(), "cloud-authority-"));
  const repo = join(dir, "repo"),
    bin = join(dir, "bin");
  const put = (path, value) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      typeof value === "string" ? value : JSON.stringify(value),
    );
  };
  const git = (...args) =>
    execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const commit = () => {
    git("add", ".");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "fixture",
    );
    return git("rev-parse", "HEAD");
  };
  try {
    mkdirSync(repo);
    mkdirSync(bin);
    cpSync(
      fileURLToPath(new URL("..", import.meta.url)),
      join(repo, "tooling"),
      { recursive: true },
    );
    git("init", "-q", "-b", "main");
    put(join(repo, C.productPath), "fixture product bytes\n");
    const oldManifestPath = ".morro/changesets/" + C.predecessor + ".json";
    const historical = JSON.parse(
      execFileSync("git", ["show", C.preservedSha + ":" + oldManifestPath], {
        cwd: fileURLToPath(new URL("../..", import.meta.url)),
        encoding: "utf8",
      }),
    );
    const r1Path = ".morro/changesets/" + C.retiredSuccessor + ".json";
    for (const path of [r1Path, ".github/morro-control/events.ndjson"])
      put(
        join(repo, path),
        execFileSync("git", ["show", C.retirementSha + ":" + path], {
          cwd: fileURLToPath(new URL("../..", import.meta.url)),
          encoding: "utf8",
        }),
      );
    put(join(repo, oldManifestPath), { ...historical, state: "IMPLEMENTING" });
    const handoff = commit();
    put(join(repo, oldManifestPath), historical);
    const preserved = commit(),
      sourceTree = git("rev-parse", "HEAD^{tree}");
    const modulePath = join(
      repo,
      "tooling/mdctl/task-correction-authority.mjs",
    );
    let source = readFileSync(modulePath, "utf8");
    for (const [before, after] of [
      [C.handoffSha, handoff],
      [C.retirementSha, handoff],
      [C.preservedSha, preserved],
      [C.productBlob, git("rev-parse", preserved + ":" + C.productPath)],
      ["ccacb2ae3c47260b2a9c9a132704bf02ce727a94", sourceTree],
      [
        "630879dc8e21829937acd9288cfbf9e7225aa446",
        git("rev-parse", preserved + ":" + oldManifestPath),
      ],
    ])
      source = source.replaceAll(before, after);
    put(modulePath, source);
    const canonicalRegistry = JSON.parse(
      readFileSync(
        new URL("../../.github/morro-control/claims.json", import.meta.url),
      ),
    );
    const ids = [C.successor, "MD-CSS-ENTRY-ORDER-GRANT-R2-20261027"];
    let registry = {
      schemaVersion: 1,
      registryAuthority: "ORCHESTRATOR",
      claims: {},
    };
    for (const id of ids) {
      registry.claims[id] = {
        ...canonicalRegistry.claims[id],
        expiresAt: "2026-10-26T00:00:00.000Z",
      };
      put(
        join(repo, ".morro/changesets/" + id + ".json"),
        JSON.parse(
          readFileSync(
            new URL("../../.morro/changesets/" + id + ".json", import.meta.url),
          ),
        ),
      );
    }
    put(join(repo, ".github/morro-control/claims.json"), registry);
    put(join(repo, ".github/morro-control/events.ndjson"), "");
    commit();
    const prs = {},
      retirements = {};
    for (const [index, id] of ids.entries()) {
      const base = git("rev-parse", "HEAD"),
        path = ".morro/changesets/" + id + ".json";
      const claim = registry.claims[id];
      const result = buildClaimRetirement({
        registry,
        ledgerText: readFileSync(
          join(repo, ".github/morro-control/events.ndjson"),
          "utf8",
        ),
        manifest: JSON.parse(readFileSync(join(repo, path))),
        evidence: {
          id,
          branch: claim.branch,
          baseSha: claim.baseSha,
          reason: "EXPIRED",
        },
        retirementBaseSha: base,
        retirementBranch: "chore/fixture-retirement-" + index,
        observedAt:
          variant === "future-retirement"
            ? new Date(Date.now() + 3600000).toISOString()
            : "2026-10-26T01:00:00.000Z",
        now: Date.parse("2026-10-26T01:00:00.000Z"),
      });
      git("checkout", "-qb", "chore/fixture-retirement-" + index);
      registry = result.registry;
      put(join(repo, ".github/morro-control/claims.json"), registry);
      put(join(repo, ".github/morro-control/events.ndjson"), result.ledgerText);
      put(join(repo, path), result.manifest);
      const head = commit();
      git("checkout", "-q", "main");
      git(
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "merge",
        "--no-ff",
        "-qm",
        "fixture merge",
        head,
      );
      const merge = git("rev-parse", "HEAD");
      const pr = {
        number: index + 10,
        merged: true,
        merge_commit_sha: merge,
        base: { ref: "main", sha: base, repo: { full_name: C.repository } },
        head: { sha: head, repo: { full_name: C.repository } },
      };
      prs[merge] = pr;
      retirements[index === 0 ? "product" : "grant"] = merge;
    }
    if (variant === "r1-history") {
      const path = ".morro/task-corrections/" + C.retiredSuccessor + ".json";
      put(join(repo, path), { state: "ISSUED" });
      commit();
      rmSync(join(repo, path));
      commit();
    }
    const manifest = JSON.parse(
      readFileSync(
        new URL(
          "../../.morro/changesets/" + C.successor + ".json",
          import.meta.url,
        ),
      ),
    );
    Object.assign(manifest, {
      id: CLOUD.successor,
      branch: CLOUD.branch,
      baseSha: git("rev-parse", "HEAD"),
    });
    manifest.owns.paths = [
      ".morro/changesets/" + CLOUD.successor + ".json",
      C.productPath,
    ];
    const clock = Date.now(),
      issuedAt = new Date(
        Math.floor((clock - 2000) / 1000) * 1000,
      ).toISOString();
    const expiresAt = new Date(Date.parse(issuedAt) + 1800000).toISOString();
    const claim = {
      ...canonicalRegistry.claims[C.successor],
      branch: CLOUD.branch,
      paths: manifest.owns.paths,
      baseSha: manifest.baseSha,
      expiresAt,
    };
    if (variant === "claim-state") claim.status = "SUBMITTED";
    if (variant === "manifest-state") manifest.state = "MERGED";
    if (variant === "historical-envelope")
      manifest.dependencies = ["MD-UNAPPROVED-DEPENDENCY"];
    if (variant === "manifest-schema") manifest.schemaVersion = 99;
    registry.claims[CLOUD.successor] = claim;
    put(join(repo, ".github/morro-control/claims.json"), registry);
    put(join(repo, ".morro/changesets/" + CLOUD.successor + ".json"), manifest);
    const anchor = commit();
    const proposal = {
      ...cloudProposal(),
      sourceMainSha: anchor,
      issuedAt,
      expiresAt,
      retirements,
      claimDigest: correctionDigest(correctionClaim(claim)),
      envelopeDigest: correctionDigest(correctionEnvelope(manifest)),
      workspace: {
        executor: "codex",
        path: "/workspace/cloud-fixture",
        headSha: anchor,
        treeSha: git("rev-parse", "HEAD^{tree}"),
      },
    };
    put(join(repo, CLOUD.path), proposal);
    const current = commit();
    const root = "repos/" + C.repository;
    const comment = {
      id: 2,
      issue_url: "https://api.github.com/" + root + "/issues/1",
      html_url:
        "https://github.com/" + C.repository + "/issues/1#issuecomment-2",
      user: { login: CLOUD.operatorLogin, id: CLOUD.operatorId, type: "User" },
      author_association: "OWNER",
      performed_via_github_app: null,
      body: cloudCorrectionApprovalBody(proposal),
      created_at: issuedAt.replace(".000Z", "Z"),
      updated_at: issuedAt.replace(".000Z", "Z"),
    };
    const config = {
      repo,
      root,
      prs,
      current,
      comment,
      scenario: "success",
      proposalPath: CLOUD.path,
    };
    put(join(dir, "config.json"), config);
    put(
      join(bin, "gh"),
      `#!${process.execPath}
import {readFileSync, appendFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const c=JSON.parse(readFileSync(${JSON.stringify(join(dir, "config.json"))}));
const args=process.argv.slice(2); if(args[0]!=='api'||args[args.indexOf('--method')+1]!=='GET') process.exit(91);
const raw=args.at(-1); if(!raw.startsWith(c.root+'/')) process.exit(92);
appendFileSync(${JSON.stringify(join(dir, "reads.log"))},raw+'\\n');
const u=new URL('https://api.github.com/'+raw), path=u.pathname.slice(c.root.length+2);
const git=(...a)=>execFileSync('git',['-C',c.repo,...a],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const commit=(ref)=>{const sha=git('rev-parse',ref);return {sha,parents:git('show','-s','--format=%P',sha).split(' ').filter(Boolean).map(sha=>({sha})),commit:{tree:{sha:git('rev-parse',sha+'^{tree}')}},files:(git('show','-s','--format=%P',sha)?git('diff-tree','--no-commit-id','--name-status','-r',sha+'^1',sha):'').split('\\n').filter(Boolean).map(line=>{const [s,filename]=line.split('\\t');return {filename,status:s==='M'?'modified':s==='A'?'added':'removed'};})}};
let out;
if(path==='commits/main') out={sha:(c.scenario==='main-drift'||(c.scenario==='main-second'&&readFileSync(${JSON.stringify(join(dir, "reads.log"))},'utf8').split('/commits/main').length>2))?'f'.repeat(40):c.current};
else if(path==='commits') {const list=git('log','--format=%H',u.searchParams.get('sha'),'--',u.searchParams.get('path')).split('\\n').filter(Boolean).map(sha=>({sha}));out=c.scenario==='history-overflow'?Array(33).fill({sha:c.current}):list;}
else if(path.startsWith('contents/')) {const filename=decodeURIComponent(path.slice(9)),ref=u.searchParams.get('ref');const bytes=execFileSync('git',['-C',c.repo,'show',ref+':'+filename]);out={type:'file',encoding:'base64',sha:git('rev-parse',ref+':'+filename),content:bytes.toString('base64')};if(c.scenario==='blob-corruption')out.sha='f'.repeat(40);}
else if(path.startsWith('compare/')) {const [base,head]=path.slice(8).split('...');out={base_commit:{sha:base},merge_base_commit:{sha:git('merge-base',base,head)},status:base===head?'identical':'ahead',files:git('diff','--name-status',base,head).split('\\n').filter(Boolean).map(line=>{const [s,filename]=line.split('\\t');return {filename,status:s==='M'?'modified':'added'};})};}
else if(path.startsWith('commits/')&&path.endsWith('/pulls'))out=[c.prs[path.split('/')[1]]].filter(Boolean);
else if(path.startsWith('commits/'))out=commit(path.slice(8));
else if(path.startsWith('pulls/')){out=Object.values(c.prs).find(p=>p.number===Number(path.slice(6)));if(c.scenario==='retirement-pr')out.merged=false;}
else if(path==='issues/1')out={number:1,html_url:'https://github.com/'+c.root.slice(6)+'/issues/1'};
else if(path==='issues/comments/2'){out=c.comment;if(c.scenario==='actor')out.user.id++;if(c.scenario==='edited')out.updated_at='2026-10-26T01:00:00Z';if(c.scenario==='body')out.body+='x';}
else process.exit(93);
process.stdout.write(JSON.stringify(out));
`,
    );
    execFileSync("chmod", ["+x", join(bin, "gh")]);
    const runner = join(dir, "run.mjs");
    put(
      runner,
      `import {collectCloudCorrectionProposal,assertCorrectionAuthority} from ${JSON.stringify(pathToFileURL(modulePath).href)};
try {const result=collectCloudCorrectionProposal({expectedMain:${JSON.stringify(current)}});let nativeRejected=false;try{assertCorrectionAuthority(result,{})}catch{nativeRejected=true}console.log(JSON.stringify({result,nativeRejected}));}catch(e){console.log(JSON.stringify({error:e.message}));process.exitCode=2;}`,
    );
    const invoke = (scenario) => {
      put(join(dir, "config.json"), { ...config, scenario });
      put(join(dir, "reads.log"), "");
      const result = spawnSync(process.execPath, [runner], {
        env: { ...process.env, PATH: bin + ":" + process.env.PATH },
        encoding: "utf8",
        timeout: 120000,
      });
      assert.equal(result.error, undefined);
      return {
        status: result.status,
        ...JSON.parse(result.stdout),
        reads: readFileSync(join(dir, "reads.log"), "utf8"),
      };
    };
    await run({ invoke, git, current, anchor, proposal });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
test("cloud collector composes real Git history, retirements and owner approval without authority", async () => {
  await withCloudCollectorFixture(async ({ invoke, git, current, anchor }) => {
    const before = git("status", "--porcelain"),
      result = invoke("success");
    assert.equal(result.status, 0, JSON.stringify(result));
    assert.equal(result.result.status, "DECLARATION_VERIFIED");
    assert.equal(result.result.operationalAuthority, false);
    assert.equal(result.result.currentMainSha, current);
    assert.equal(result.result.declaredRequest.exactBaseSha, anchor);
    assert.equal(result.result.requiresReanchor, true);
    assert.equal(result.nativeRejected, true);
    assert.equal(result.result.retirements.length, 2);
    assert.equal(git("status", "--porcelain"), before);
    for (const [scenario, code] of [
      ["actor", "CLOUD_APPROVAL_ACTOR"],
      ["edited", "CLOUD_APPROVAL_EDITED"],
      ["body", "CLOUD_APPROVAL_BODY"],
      ["retirement-pr", "CLOUD_RETIREMENT_PR_MERGED"],
      ["blob-corruption", "CORRECTION_BLOB_HASH"],
      ["main-drift", "CLOUD_MAIN_MOVED"],
      ["main-second", "CLOUD_MAIN_MOVED"],
      ["history-overflow", "CLOUD_HISTORY_BOUND"],
    ]) {
      const failure = invoke(scenario);
      assert.equal(failure.status, 2, scenario);
      assert.ok(failure.error.includes(code), JSON.stringify(failure));
      assert.equal(failure.result, undefined);
      if (scenario === "history-overflow")
        assert.ok(!failure.reads.includes("/contents/"));
    }
  });
});

for (const [variant, code] of [
  ["claim-state", "CLOUD_CLAIM_STATE"],
  ["manifest-state", "CLOUD_MANIFEST_STATE"],
  ["r1-history", "CSS_RETIRED_GRANT_HISTORY"],
  ["future-retirement", "CLOUD_RETIREMENT_FUTURE"],
  ["historical-envelope", "CLOUD_HISTORICAL_ENVELOPE_CHANGED"],
  ["manifest-schema", "CHANGESET_SCHEMA_VERSION_INVALID"],
])
  test("cloud collector rejects canonical fixture " + variant, async () => {
    await withCloudCollectorFixture(({ invoke }) => {
      const failure = invoke("success");
      assert.equal(failure.status, 2);
      assert.ok(failure.error.includes(code), JSON.stringify(failure));
    }, variant);
  });
