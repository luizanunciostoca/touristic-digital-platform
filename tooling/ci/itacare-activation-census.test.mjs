import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import {
  ACTIVATION_PATHS,
  SNAPSHOT_PATHS,
  assertCapturedHeadUnchanged,
  captureSnapshot,
  classifyNeutralMaintenance,
  runMaintenanceProof,
} from "./itacare-activation-census.mjs";

const VALIDATOR = "tooling/ci/itacare-activation-census.mjs";
const WORKFLOW = ".github/workflows/itacare-product-candidate-proof.yml";
const validatorSource = readFileSync(VALIDATOR);
const ENTRY = "apps/morro-digital-platform/src/browser-entry.ts";
const UI = [
  "apps/morro-digital-platform/public/destination.html",
  "apps/morro-digital-platform/src/destinations/destination-browser-entry.ts",
  "apps/morro-digital-platform/src/destinations/destination-page.ts",
];
const IMPORT =
  'import { getV1ExploreUiCopy } from "./map/explore-v1-i18n.js";\n';
const CALL =
  "getV1ExploreUiCopy(locale).categoryAria(category.label, category.count)";
const OLD = "\x60\x24{category.label} · \x24{category.count} locais\x60";
const baseline = [
  'import { createV1ExploreMarkerElement } from "./map/explore-marker-element.js";',
  "function installDiscoverCategoryRail() {",
  '  button.setAttribute("aria-label", ' + OLD + ");",
  "}",
  "",
].join("\n");
const localized = baseline.replace("\n", "\n" + IMPORT).replace(OLD, CALL);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function file(bytes, mode = "100644", type = "blob") {
  bytes = Buffer.from(bytes);
  return {
    bytes,
    mode,
    type,
    oid: createHash("sha1")
      .update("blob " + bytes.length + "\0")
      .update(bytes)
      .digest("hex"),
  };
}
function fixture() {
  const files = Object.fromEntries(
    SNAPSHOT_PATHS.map((path) => [
      path,
      UI.includes(path) ? null : file("export const fixture = true;\n"),
    ]),
  );
  files[ENTRY] = file(baseline);
  const result = {
    baseSha: "a".repeat(40),
    headSha: "b".repeat(40),
    headTreeSha: "c".repeat(40),
    baseFiles: files,
    headFiles: Object.fromEntries(
      Object.entries(files).map(([path, value]) => [
        path,
        value === null ? null : file(value.bytes),
      ]),
    ),
  };
  result.headFiles[ENTRY] = file(localized);
  return result;
}
function put(snapshot, path, text, side = "headFiles", mode) {
  snapshot[side][path] = file(text, mode);
}

test("the closed recipe preserves identities and reports one changed path truthfully", () => {
  const receipt = classifyNeutralMaintenance(fixture());
  assert.equal(receipt.classification, "NEUTRAL_DISCOVER_CATEGORY_ARIA_V1");
  assert.equal(receipt.activated, false);
  assert.deepEqual(receipt.originalChangedActivationPaths, [ENTRY]);
  assert.equal(receipt.reversedEntrySha256, sha256(baseline));
  assert.equal(Object.keys(receipt.sources).length, 15);
  assert.equal(receipt.sources[ENTRY].base.sha256, sha256(baseline));
  assert.equal(receipt.sources[ENTRY].head.sha256, sha256(localized));
  assert.ok(!JSON.stringify(receipt).includes("button.setAttribute"));
});

for (const [name, mutate, expected] of [
  [
    "extra import",
    (s) => s + 'import "./side-effect.js";\n',
    /REVERSAL_MISMATCH/,
  ],
  [
    "extra side effect",
    (s) => s + "activateDestination();\n",
    /REVERSAL_MISMATCH/,
  ],
  ["extra comment", (s) => s + "// another delta\n", /REVERSAL_MISMATCH/],
  ["extra whitespace", (s) => s + "\n", /REVERSAL_MISMATCH/],
  [
    "copy elsewhere",
    (s) => s.replace("function ", "/* copy */ function "),
    /REVERSAL_MISMATCH/,
  ],
  ["duplicate import", (s) => s + IMPORT, /CARDINALITY_INVALID/],
  ["duplicate expression", (s) => s + CALL + ";\n", /CARDINALITY_INVALID/],
  [
    "namespace import",
    (s) =>
      s.replace(IMPORT, 'import * as copy from "./map/explore-v1-i18n.js";\n'),
    /CARDINALITY_INVALID/,
  ],
  [
    "changed import target",
    (s) => s.replace("explore-v1-i18n.js", "untrusted.js"),
    /CARDINALITY_INVALID/,
  ],
  [
    "side effect argument",
    (s) => s.replace("category.count)", "category.count, activate())"),
    /CARDINALITY_INVALID/,
  ],
  [
    "alternate import spelling",
    (s) => s.replace("import { getV1", "import {getV1"),
    /CARDINALITY_INVALID/,
  ],
  [
    "CRLF import",
    (s) => s.replace(IMPORT, IMPORT.replace("\n", "\r\n")),
    /CARDINALITY_INVALID/,
  ],
  [
    "activation marker",
    (s) => s + "toCoreDestinationConfig();\n",
    /BINDING_PRESENT/,
  ],
]) {
  test("neutral classification rejects " + name, () => {
    const snapshot = fixture();
    put(snapshot, ENTRY, mutate(localized));
    assert.throws(() => classifyNeutralMaintenance(snapshot), expected);
  });
}

test("a baseline already containing the recipe is not a repeatable replace authority", () => {
  const snapshot = fixture();
  put(snapshot, ENTRY, localized, "baseFiles");
  put(snapshot, ENTRY, localized + "\n");
  assert.throws(
    () => classifyNeutralMaintenance(snapshot),
    /CARDINALITY_INVALID/,
  );
});
test("activation markers in either baseline or head remain denied", () => {
  const snapshot = fixture();
  put(snapshot, ENTRY, baseline + "toCoreDestinationConfig();\n", "baseFiles");
  put(snapshot, ENTRY, localized + "toCoreDestinationConfig();\n");
  assert.throws(() => classifyNeutralMaintenance(snapshot), /BINDING_PRESENT/);
});

for (const path of ACTIVATION_PATHS.filter((p) => p !== ENTRY)) {
  test("another activation path is never neutral: " + path, () => {
    const snapshot = fixture();
    put(snapshot, path, "changed");
    assert.throws(
      () => classifyNeutralMaintenance(snapshot),
      UI.includes(path)
        ? /UI_ALREADY_OR_PARTIALLY_ACTIVATED/
        : /ONLY_BROWSER_ENTRY/,
    );
  });
}
for (const path of UI) {
  test("an existing destination UI baseline is never neutral: " + path, () => {
    const snapshot = fixture();
    put(snapshot, path, "existing", "baseFiles");
    put(snapshot, path, "existing");
    assert.throws(
      () => classifyNeutralMaintenance(snapshot),
      /UI_ALREADY_OR_PARTIALLY_ACTIVATED/,
    );
  });
}
for (const path of SNAPSHOT_PATHS.filter(
  (p) => !ACTIVATION_PATHS.includes(p),
)) {
  test("context dependency cannot change: " + path, () => {
    const snapshot = fixture();
    put(snapshot, path, "changed context");
    assert.throws(
      () => classifyNeutralMaintenance(snapshot),
      /CONTEXT_CHANGED_OR_ABSENT/,
    );
  });
  test("context dependency cannot disappear: " + path, () => {
    const snapshot = fixture();
    snapshot.headFiles[path] = null;
    assert.throws(
      () => classifyNeutralMaintenance(snapshot),
      /CONTEXT_CHANGED_OR_ABSENT/,
    );
  });
}
for (const [name, alter, expected] of [
  [
    "symlink",
    (s) => {
      s.headFiles[ENTRY].mode = "120000";
    },
    /MODE_INVALID/,
  ],
  [
    "chmod",
    (s) => {
      s.headFiles[ENTRY].mode = "100755";
    },
    /MODE_INVALID/,
  ],
  [
    "tree",
    (s) => {
      s.headFiles[ENTRY].type = "tree";
    },
    /MODE_INVALID/,
  ],
  [
    "missing path capture",
    (s) => {
      delete s.headFiles[ENTRY];
    },
    /SNAPSHOT_PATH_SET/,
  ],
  [
    "unexpected path",
    (s) => {
      s.headFiles.extra = null;
    },
    /SNAPSHOT_PATH_SET/,
  ],
  [
    "blob identity mismatch",
    (s) => {
      s.headFiles[ENTRY].oid = "d".repeat(40);
    },
    /BLOB_IDENTITY_INVALID/,
  ],
  [
    "invalid SHA",
    (s) => {
      s.baseSha = "HEAD";
    },
    /SNAPSHOT_IDENTITY_INVALID/,
  ],
  [
    "invalid UTF8",
    (s) => {
      put(
        s,
        ENTRY,
        Buffer.concat([Buffer.from(localized), Buffer.from([255])]),
      );
    },
    /UTF8_INVALID/,
  ],
  [
    "oversized source",
    (s) => {
      put(s, ENTRY, Buffer.alloc(1024 * 1024 + 1));
    },
    /SOURCE_BYTES_INVALID/,
  ],
]) {
  test("invalid snapshot fails closed: " + name, () => {
    const snapshot = fixture();
    alter(snapshot);
    assert.throws(() => classifyNeutralMaintenance(snapshot), expected);
  });
}
test("no-change and twelve-path activation do not enter the neutral recipe", () => {
  const unchanged = fixture();
  unchanged.headFiles[ENTRY] = file(baseline);
  assert.throws(
    () => classifyNeutralMaintenance(unchanged),
    /ONLY_BROWSER_ENTRY/,
  );
  const all = fixture();
  for (const path of ACTIVATION_PATHS)
    put(all, path, "full activation candidate");
  assert.throws(
    () => classifyNeutralMaintenance(all),
    /UI_ALREADY_OR_PARTIALLY_ACTIVATED/,
  );
});

function realFixture(t, { withValidator = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "itacare-census-"));
  const repo = join(dir, "repo");
  mkdirSync(repo);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
  git("init", "--quiet", "--initial-branch=main");
  git("config", "user.name", "Census Fixture");
  git("config", "user.email", "fixture@example.invalid");
  const fixtureSnapshot = fixture();
  for (const [path, entry] of Object.entries(fixtureSnapshot.baseFiles)) {
    if (entry === null) continue;
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), entry.bytes);
  }
  if (withValidator) {
    mkdirSync(dirname(join(repo, VALIDATOR)), { recursive: true });
    writeFileSync(join(repo, VALIDATOR), validatorSource);
  }
  writeFileSync(
    join(repo, "apps/morro-digital-platform/tooling/dev-server.mjs"),
    "// SERVER_BOUND_UI_ABSENT resolveTrustedPlaceDestinationScope({ trustedPlace.scope\n" +
      "// DESTINATION_UI_NOT_RELEASED DISPOSABLE_PROOF_DOTENV_DENIED destination-page-resolver.mjs\n",
  );
  writeFileSync(
    join(
      repo,
      "apps/morro-digital-platform/tooling/itacare-place-destination-http.mysql.mjs",
    ),
    "// REAL_DEV_SERVER_API_PROVEN\n",
  );
  git("add", ".");
  git("commit", "--quiet", "-m", "base");
  const baseSha = git("rev-parse", "HEAD");
  writeFileSync(join(repo, ENTRY), localized);
  git("add", ".");
  git("commit", "--quiet", "-m", "localized");
  const headSha = git("rev-parse", "HEAD");
  const receiptPath = join(dir, "receipt.json");
  return { dir, repo, git, baseSha, headSha, receiptPath };
}
test("real Git capture binds exact HEAD, tree, source blobs and a create-only receipt", (t) => {
  const f = realFixture(t);
  const receipt = runMaintenanceProof(f.repo, f);
  assert.equal(receipt.headSha, f.headSha);
  assert.equal(receipt.headTreeSha, f.git("rev-parse", "HEAD^{tree}"));
  assert.deepEqual(JSON.parse(readFileSync(f.receiptPath)), receipt);
  assert.equal(statSync(f.receiptPath).mode & 0o777, 0o600);
  const before = readFileSync(f.receiptPath);
  assert.throws(() => runMaintenanceProof(f.repo, f), /EEXIST/);
  assert.deepEqual(readFileSync(f.receiptPath), before);
});
test("CLI captures real Git objects and emits no success on a dirty worktree", (t) => {
  const f = realFixture(t);
  writeFileSync(join(f.repo, "untracked"), "uncommitted");
  const result = spawnSync(
    process.execPath,
    [
      resolve("tooling/ci/itacare-activation-census.mjs"),
      "--base",
      f.baseSha,
      "--head",
      f.headSha,
      "--receipt",
      f.receiptPath,
    ],
    { cwd: f.repo, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /WORKTREE_NOT_CLEAN/);
  assert.equal(result.stdout, "");
  assert.equal(existsSync(f.receiptPath), false);
});
test("Git errors are not interpreted as a changed file", (t) => {
  const f = realFixture(t);
  assert.throws(
    () => captureSnapshot(f.repo, "0".repeat(40), f.headSha),
    /GIT_COMMAND_FAILED/,
  );
  assert.equal(existsSync(f.receiptPath), false);
});
test("a nonancestor base is denied separately from a Git command error", (t) => {
  const f = realFixture(t);
  f.git("checkout", "--quiet", "--orphan", "other");
  f.git("commit", "--quiet", "-m", "unrelated root");
  const unrelated = f.git("rev-parse", "HEAD");
  assert.throws(
    () => captureSnapshot(f.repo, f.baseSha, unrelated),
    /BASE_NOT_ANCESTOR/,
  );
});
test("HEAD drift after capture fails the same recheck used at receipt boundaries", (t) => {
  const f = realFixture(t);
  const snapshot = captureSnapshot(f.repo, f.baseSha, f.headSha);
  f.git("commit", "--quiet", "--allow-empty", "-m", "new head");
  assert.throws(
    () => assertCapturedHeadUnchanged(f.repo, snapshot),
    /CURRENT_HEAD_MISMATCH/,
  );
});
test("symlink receipt parents are denied without changing the target", (t) => {
  const f = realFixture(t);
  mkdirSync(join(f.dir, "real"));
  symlinkSync(join(f.dir, "real"), join(f.dir, "alias"));
  assert.throws(
    () =>
      runMaintenanceProof(f.repo, {
        ...f,
        receiptPath: join(f.dir, "alias", "receipt.json"),
      }),
    /RECEIPT_PARENT_INVALID/,
  );
  assert.equal(existsSync(join(f.dir, "real", "receipt.json")), false);
});

test("original zero/twelve branches and scoped/server guards stay byte-identical", () => {
  const workflow = readFileSync(
    ".github/workflows/itacare-product-candidate-proof.yml",
    "utf8",
  );
  const zero = workflow.indexOf('          if test "$changed" -eq 0; then');
  const twelve = workflow.indexOf(
    '          elif test "$changed" -eq 12; then',
    zero,
  );
  const partial = workflow.indexOf("          else\n", twelve);
  const guards = workflow.indexOf(
    "          if test -f apps/morro-digital-platform/tooling/itacare-place-destination-http.mysql.mjs; then",
  );
  assert.equal(
    sha256(workflow.slice(zero, twelve)),
    "f0a0cdfec18bc558ab13224b2c1e39dcb3b3013dd1d0ef8d8082a1ba8653a531",
  );
  assert.equal(
    sha256(workflow.slice(twelve, partial)),
    "34a7d60bc731c13eea9e050b4ae8002d090c3d99c248a5b99dbaa0386c93e9ed",
  );
  assert.equal(
    sha256(workflow.slice(guards, zero)),
    "7616cea66cf6fcc7216df1773104b7028576820f71b4fa9b6901eef4729e9750",
  );
  assert.ok(
    !workflow.slice(zero, partial).includes("itacare-activation-census.mjs"),
  );
  assert.ok(workflow.slice(partial).includes("changed=1/12 server_bound="));
  assert.ok(workflow.slice(partial).includes("neutral-maintenance.json"));
});

function censusScript() {
  const workflow = readFileSync(WORKFLOW, "utf8");
  const section = workflow.slice(
    workflow.indexOf("      - name: Activation census\n"),
    workflow.indexOf("      - name: Build exact current dependencies"),
  );
  return section
    .slice(section.indexOf("        run: |\n") + "        run: |\n".length)
    .split("\n")
    .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
    .join("\n");
}
function workflowProof(f, extraEnv = {}, prepareEvidence = () => {}) {
  const runner = mkdtempSync(join(f.dir, "runner-"));
  const evidence = join(runner, "itacare-product-evidence");
  mkdirSync(evidence);
  prepareEvidence(evidence);
  const output = join(runner, "output");
  writeFileSync(output, "");
  const result = spawnSync("bash", ["-c", censusScript()], {
    cwd: f.repo,
    encoding: "utf8",
    env: {
      ...process.env,
      RUNNER_TEMP: runner,
      GITHUB_OUTPUT: output,
      CANDIDATE_BASE: f.baseSha,
      CANDIDATE_HEAD: f.headSha,
      ...extraEnv,
    },
  });
  return { ...result, evidence, output: readFileSync(output, "utf8") };
}
function commitFixture(f, message) {
  f.git("add", ".");
  f.git("commit", "--quiet", "-m", message);
  f.headSha = f.git("rev-parse", "HEAD");
}

test("workflow runs only the hash-bound BASE validator even if candidate helper returns success", (t) => {
  const f = realFixture(t);
  writeFileSync(
    join(f.repo, VALIDATOR),
    'console.log("CANDIDATE_HELPER_EXECUTED"); process.exit(0);\n',
  );
  writeFileSync(join(f.repo, ENTRY), localized + "activateDestination();\n");
  commitFixture(f, "candidate classifier cannot approve unknown source");
  const result = workflowProof(f);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /REVERSAL_MISMATCH/);
  assert.doesNotMatch(result.stdout, /CANDIDATE_HELPER_EXECUTED/);
  assert.equal(
    existsSync(join(result.evidence, "neutral-maintenance.json")),
    false,
  );
});
test("workflow recipe reports one path and binds create-only BASE source, blob and SHA256", (t) => {
  const f = realFixture(t);
  writeFileSync(
    join(f.repo, VALIDATOR),
    'throw new Error("CANDIDATE_HELPER_EXECUTED");\n',
  );
  commitFixture(f, "candidate helper is irrelevant to trusted recipe");
  const result = workflowProof(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.output, /activated=false/);
  const receipt = JSON.parse(
    readFileSync(join(result.evidence, "neutral-maintenance.json")),
  );
  const binding = JSON.parse(
    readFileSync(join(result.evidence, "base-validator.mjs.identity.json")),
  );
  assert.equal(receipt.validator.baseSha, f.baseSha);
  assert.equal(receipt.validator.blob, binding.blob);
  assert.equal(receipt.validator.sha256, sha256(validatorSource));
  assert.equal(receipt.validator.sha256, binding.sha256);
  assert.deepEqual(receipt.originalChangedActivationPaths, [ENTRY]);
  assert.match(
    readFileSync(join(result.evidence, "runtime-state.txt"), "utf8"),
    /changed=1\/12/,
  );
  assert.equal(
    statSync(join(result.evidence, "base-validator.mjs")).mode & 0o777,
    0o400,
  );
});
test("a BASE without the validator denies the exception with no candidate fallback", (t) => {
  const f = realFixture(t, { withValidator: false });
  mkdirSync(dirname(join(f.repo, VALIDATOR)), { recursive: true });
  writeFileSync(join(f.repo, VALIDATOR), "process.exit(0);\n");
  commitFixture(f, "candidate-only helper");
  const result = workflowProof(f);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /BASE_VALIDATOR_ABSENT_OR_INVALID/);
  assert.equal(
    existsSync(join(result.evidence, "neutral-maintenance.json")),
    false,
  );
});
test("direct candidate validator bytes cannot produce a BASE-bound accepted receipt", (t) => {
  const f = realFixture(t);
  // BASE contains another source identity; the imported implementation must reject itself.
  f.git("checkout", "--quiet", f.baseSha);
  writeFileSync(join(f.repo, VALIDATOR), "// different trusted source\n");
  commitFixture(f, "different BASE validator");
  f.baseSha = f.headSha;
  writeFileSync(join(f.repo, ENTRY), localized);
  commitFixture(f, "recipe");
  assert.throws(
    () => runMaintenanceProof(f.repo, f),
    /BASE_VALIDATOR_MISMATCH/,
  );
  assert.equal(existsSync(f.receiptPath), false);
});
test("producer zero-path CI maintenance keeps the original branch even without BASE helper", (t) => {
  const f = realFixture(t, { withValidator: false });
  f.git("checkout", "--quiet", f.baseSha);
  mkdirSync(dirname(join(f.repo, VALIDATOR)), { recursive: true });
  writeFileSync(join(f.repo, VALIDATOR), validatorSource);
  commitFixture(f, "CI-only producer");
  const result = workflowProof(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    readFileSync(join(result.evidence, "runtime-state.txt"), "utf8"),
    /changed=0\/12/,
  );
  assert.equal(existsSync(join(result.evidence, "base-validator.mjs")), false);
});
test("complete twelve-path activation keeps the original activated branch", (t) => {
  const f = realFixture(t);
  for (const path of ACTIVATION_PATHS) {
    mkdirSync(dirname(join(f.repo, path)), { recursive: true });
    writeFileSync(
      join(f.repo, path),
      "// complete activation destination-browser-entry.js toCoreDestinationConfig\n",
    );
  }
  commitFixture(f, "complete twelve-path activation");
  const result = workflowProof(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.output, /activated=true/);
  assert.equal(
    existsSync(join(result.evidence, "neutral-maintenance.json")),
    false,
  );
});

for (const [name, mutate, expected] of [
  [
    "ignored physical UI file",
    (f) => {
      writeFileSync(join(f.repo, ".git/info/exclude"), UI[0] + "\n");
      mkdirSync(dirname(join(f.repo, UI[0])), { recursive: true });
      writeFileSync(join(f.repo, UI[0]), "ignored activation");
    },
    /PHYSICAL_HEAD_MISMATCH/,
  ],
  [
    "ignored dangling UI symlink",
    (f) => {
      writeFileSync(join(f.repo, ".git/info/exclude"), UI[0] + "\n");
      mkdirSync(dirname(join(f.repo, UI[0])), { recursive: true });
      symlinkSync("missing-target", join(f.repo, UI[0]));
    },
    /PHYSICAL_SOURCE_INVALID/,
  ],
  [
    "assume-unchanged ENTRY activation marker",
    (f) => {
      f.git("update-index", "--assume-unchanged", ENTRY);
      writeFileSync(
        join(f.repo, ENTRY),
        localized + "toCoreDestinationConfig();\n",
      );
    },
    /PHYSICAL_HEAD_MISMATCH/,
  ],
  [
    "assume-unchanged locale helper context",
    (f) => {
      const path = "apps/morro-digital-platform/src/map/explore-v1-i18n.ts";
      f.git("update-index", "--assume-unchanged", path);
      writeFileSync(join(f.repo, path), "untrusted context\n");
    },
    /PHYSICAL_HEAD_MISMATCH/,
  ],
  [
    "skip-worktree missing ENTRY",
    (f) => {
      f.git("update-index", "--skip-worktree", ENTRY);
      rmSync(join(f.repo, ENTRY));
    },
    /PHYSICAL_HEAD_MISMATCH/,
  ],
  [
    "sparse checkout omitted context",
    (f) => {
      f.git("sparse-checkout", "set", "--no-cone", "/*", "!/apps/");
    },
    /PHYSICAL_HEAD_MISMATCH/,
  ],
  [
    "executable physical ENTRY with ignored filemode",
    (f) => {
      f.git("config", "core.filemode", "false");
      chmodSync(join(f.repo, ENTRY), 0o755);
    },
    /PHYSICAL_SOURCE_INVALID/,
  ],
  [
    "assume-unchanged ENTRY symlink",
    (f) => {
      f.git("update-index", "--assume-unchanged", ENTRY);
      rmSync(join(f.repo, ENTRY));
      symlinkSync("missing-target", join(f.repo, ENTRY));
    },
    /PHYSICAL_SOURCE_INVALID/,
  ],
]) {
  test("physical HEAD binding rejects clean-status " + name, (t) => {
    const f = realFixture(t);
    mutate(f);
    assert.equal(f.git("status", "--porcelain"), "");
    assert.throws(() => runMaintenanceProof(f.repo, f), expected);
    assert.equal(existsSync(f.receiptPath), false);
  });
}
test("physical source recheck detects masked context drift after a valid snapshot", (t) => {
  const f = realFixture(t);
  const snapshot = captureSnapshot(f.repo, f.baseSha, f.headSha);
  const path = "apps/morro-digital-platform/tooling/dev-server.mjs";
  f.git("update-index", "--assume-unchanged", path);
  writeFileSync(join(f.repo, path), "changed context\n");
  assert.throws(
    () => assertCapturedHeadUnchanged(f.repo, snapshot),
    /PHYSICAL_HEAD_MISMATCH/,
  );
});
test("raw Git replacement cannot shadow an unknown source tree with the benign recipe", (t) => {
  const f = realFixture(t);
  const benign = f.headSha;
  writeFileSync(join(f.repo, ENTRY), localized + "activateDestination();\n");
  commitFixture(f, "unknown actual source");
  const bad = f.headSha;
  f.git("replace", bad, benign);
  f.git("reset", "--hard", bad);
  assert.equal(f.git("status", "--porcelain"), "");
  assert.throws(
    () => runMaintenanceProof(f.repo, f),
    /PHYSICAL_HEAD_MISMATCH|WORKTREE_NOT_CLEAN/,
  );
  const result = workflowProof(f);
  assert.equal(result.status, 1);
  assert.equal(
    existsSync(join(result.evidence, "neutral-maintenance.json")),
    false,
  );
});
test("raw ancestry rejects graft files even when --no-replace-objects reports a false ancestor", (t) => {
  const f = realFixture(t);
  f.git("checkout", "--quiet", "--orphan", "grafted-orphan");
  f.git("commit", "--quiet", "-m", "raw root");
  f.headSha = f.git("rev-parse", "HEAD");
  assert.doesNotMatch(
    f.git("--no-replace-objects", "cat-file", "-p", f.headSha),
    /^parent /m,
  );
  writeFileSync(
    join(f.repo, ".git/info/grafts"),
    f.headSha + " " + f.baseSha + "\n",
  );
  assert.equal(
    spawnSync("git", [
      "--no-replace-objects",
      "-C",
      f.repo,
      "merge-base",
      "--is-ancestor",
      f.baseSha,
      f.headSha,
    ]).status,
    0,
  );
  assert.throws(() => runMaintenanceProof(f.repo, f), /GRAFTS_DENIED/);
  const result = workflowProof(f);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /GRAFTS_DENIED/);
  assert.equal(
    existsSync(join(result.evidence, "neutral-maintenance.json")),
    false,
  );
});
test("dangling graft path and a present empty GIT_GRAFT_FILE override are denied", (t) => {
  const f = realFixture(t);
  symlinkSync("missing-graft", join(f.repo, ".git/info/grafts"));
  assert.throws(() => runMaintenanceProof(f.repo, f), /GRAFTS_DENIED/);
  assert.equal(workflowProof(f).status, 1);
  rmSync(join(f.repo, ".git/info/grafts"));
  const original = process.env.GIT_GRAFT_FILE;
  process.env.GIT_GRAFT_FILE = "";
  try {
    assert.throws(() => runMaintenanceProof(f.repo, f), /GRAFTS_DENIED/);
  } finally {
    if (original === undefined) delete process.env.GIT_GRAFT_FILE;
    else process.env.GIT_GRAFT_FILE = original;
  }
  const result = workflowProof(f, { GIT_GRAFT_FILE: "" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /GRAFTS_DENIED/);
});
test("both classifier and regression changes independently select the bounded workflow", () => {
  const workflow = readFileSync(WORKFLOW, "utf8");
  const paths = workflow.slice(
    workflow.indexOf("    paths:\n"),
    workflow.indexOf("  workflow_dispatch:"),
  );
  for (const path of [
    VALIDATOR,
    "tooling/ci/itacare-activation-census.test.mjs",
  ]) {
    assert.equal(paths.split('      - "' + path + '"').length - 1, 1);
  }
  const script = censusScript();
  assert.match(
    script,
    /command git --no-replace-objects -c core\.commitGraph=false/,
  );
  assert.match(script, /git = .*--no-replace-objects.*core\.commitGraph=false/);
  assert.match(script, /node "\$ITACARE_BASE_VALIDATOR"/);
  assert.doesNotMatch(
    script,
    /node tooling\/ci\/itacare-activation-census\.mjs/,
  );
});

for (const path of UI.slice(1)) {
  for (const dangling of [false, true]) {
    test(
      "every exclusive UI path must be physically absent even when ignored: " +
        path +
        ":" +
        dangling,
      (t) => {
        const f = realFixture(t);
        writeFileSync(join(f.repo, ".git/info/exclude"), path + "\n");
        mkdirSync(dirname(join(f.repo, path)), { recursive: true });
        if (dangling) symlinkSync("missing-target", join(f.repo, path));
        else writeFileSync(join(f.repo, path), "ignored activation");
        assert.equal(f.git("status", "--porcelain"), "");
        assert.throws(
          () => runMaintenanceProof(f.repo, f),
          /PHYSICAL_HEAD_MISMATCH|PHYSICAL_SOURCE_INVALID/,
        );
        assert.equal(existsSync(f.receiptPath), false);
      },
    );
  }
}

test("BASE validator extraction is create-only and preserves preexisting bytes on denial", (t) => {
  const f = realFixture(t);
  const sentinel = "existing evidence must survive\n";
  const result = workflowProof(f, {}, (evidence) =>
    writeFileSync(join(evidence, "base-validator.mjs"), sentinel),
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /EEXIST/);
  assert.equal(
    readFileSync(join(result.evidence, "base-validator.mjs"), "utf8"),
    sentinel,
  );
  assert.equal(
    existsSync(join(result.evidence, "neutral-maintenance.json")),
    false,
  );
});
