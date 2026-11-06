import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  constants,
  fstatSync,
  readFileSync,
  lstatSync,
  openSync,
  closeSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import { dirname, isAbsolute, parse, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ACTIVATION_PATHS = Object.freeze([
  "apps/morro-digital-platform/public/destination.html",
  "apps/morro-digital-platform/src/bootstrap/geospatial.test.ts",
  "apps/morro-digital-platform/src/bootstrap/geospatial.ts",
  "apps/morro-digital-platform/src/bootstrap/runtime.test.ts",
  "apps/morro-digital-platform/src/bootstrap/runtime.ts",
  "apps/morro-digital-platform/src/browser-entry.ts",
  "apps/morro-digital-platform/src/browser.ts",
  "apps/morro-digital-platform/src/destinations/destination-browser-entry.ts",
  "apps/morro-digital-platform/src/destinations/destination-page.test.ts",
  "apps/morro-digital-platform/src/destinations/destination-page.ts",
  "apps/morro-digital-platform/src/runtime/public-destination.test.ts",
  "apps/morro-digital-platform/src/runtime/public-destination.ts",
]);
const VALIDATOR = "tooling/ci/itacare-activation-census.mjs";
const RAW_GIT = ["--no-replace-objects", "-c", "core.commitGraph=false"];
const ENTRY = "apps/morro-digital-platform/src/browser-entry.ts";
const UI_PATHS = [
  "apps/morro-digital-platform/public/destination.html",
  "apps/morro-digital-platform/src/destinations/destination-browser-entry.ts",
  "apps/morro-digital-platform/src/destinations/destination-page.ts",
];
const CONTEXT_PATHS = [
  "apps/morro-digital-platform/src/map/explore-v1-i18n.ts",
  "apps/morro-digital-platform/tooling/dev-server.mjs",
  "apps/morro-digital-platform/tooling/itacare-place-destination-http.mysql.mjs",
];
export const SNAPSHOT_PATHS = Object.freeze([
  ...ACTIVATION_PATHS,
  ...CONTEXT_PATHS,
]);
const IMPORT =
  'import { getV1ExploreUiCopy } from "./map/explore-v1-i18n.js";\n';
const EXPRESSION =
  "getV1ExploreUiCopy(locale).categoryAria(category.label, category.count)";
const OLD_ARIA = "\x60\x24{category.label} · \x24{category.count} locais\x60";
const SHA = /^[a-f0-9]{40}$/u;
const MAX_BYTES = 1024 * 1024;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const blobHash = (bytes) =>
  createHash("sha1")
    .update("blob " + bytes.length + "\0")
    .update(bytes)
    .digest("hex");

function requireThat(condition, code) {
  assert.ok(condition, code);
}

function fileIdentity(file) {
  return file === null
    ? null
    : {
        mode: file.mode,
        type: file.type,
        blob: file.oid,
        bytes: file.bytes.length,
        sha256: hash(file.bytes),
      };
}

function validateFiles(files) {
  requireThat(
    files && typeof files === "object" && !Array.isArray(files),
    "ITACARE_SNAPSHOT_INVALID",
  );
  assert.deepEqual(
    Object.keys(files).sort(),
    [...SNAPSHOT_PATHS].sort(),
    "ITACARE_SNAPSHOT_PATH_SET",
  );
  for (const path of SNAPSHOT_PATHS) {
    const file = files[path];
    if (file === null) continue;
    requireThat(
      file && file.mode === "100644" && file.type === "blob",
      "ITACARE_SOURCE_MODE_INVALID",
    );
    requireThat(
      Buffer.isBuffer(file.bytes) && file.bytes.length <= MAX_BYTES,
      "ITACARE_SOURCE_BYTES_INVALID",
    );
    requireThat(
      SHA.test(file.oid) && blobHash(file.bytes) === file.oid,
      "ITACARE_BLOB_IDENTITY_INVALID",
    );
  }
}

function equalFile(left, right) {
  return left === null || right === null
    ? left === right
    : left.mode === right.mode &&
        left.type === right.type &&
        left.oid === right.oid &&
        left.bytes.equals(right.bytes);
}

function source(file) {
  requireThat(file !== null, "ITACARE_REQUIRED_SOURCE_ABSENT");
  let value;
  try {
    value = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      file.bytes,
    );
  } catch {
    throw new Error("ITACARE_SOURCE_UTF8_INVALID");
  }
  requireThat(
    Buffer.from(value).equals(file.bytes),
    "ITACARE_SOURCE_UTF8_INVALID",
  );
  return value;
}

const occurrences = (text, value) => text.split(value).length - 1;

// This recognizes one reversible source recipe, never arbitrary partial activation.
export function classifyNeutralMaintenance(snapshot) {
  requireThat(
    snapshot &&
      SHA.test(snapshot.baseSha) &&
      SHA.test(snapshot.headSha) &&
      SHA.test(snapshot.headTreeSha),
    "ITACARE_SNAPSHOT_IDENTITY_INVALID",
  );
  validateFiles(snapshot.baseFiles);
  validateFiles(snapshot.headFiles);
  for (const path of UI_PATHS) {
    requireThat(
      snapshot.baseFiles[path] === null && snapshot.headFiles[path] === null,
      "ITACARE_UI_ALREADY_OR_PARTIALLY_ACTIVATED",
    );
  }
  const changed = ACTIVATION_PATHS.filter(
    (path) => !equalFile(snapshot.baseFiles[path], snapshot.headFiles[path]),
  );
  requireThat(
    changed.length === 1 && changed[0] === ENTRY,
    "ITACARE_RECIPE_ONLY_BROWSER_ENTRY",
  );
  for (const path of CONTEXT_PATHS) {
    requireThat(
      snapshot.baseFiles[path] !== null &&
        equalFile(snapshot.baseFiles[path], snapshot.headFiles[path]),
      "ITACARE_CONTEXT_CHANGED_OR_ABSENT",
    );
  }
  const before = source(snapshot.baseFiles[ENTRY]);
  const after = source(snapshot.headFiles[ENTRY]);
  requireThat(
    !before.includes("toCoreDestinationConfig") &&
      !after.includes("toCoreDestinationConfig"),
    "ITACARE_ACTIVATION_BINDING_PRESENT",
  );
  requireThat(
    occurrences(before, IMPORT) === 0 &&
      occurrences(before, EXPRESSION) === 0 &&
      occurrences(before, OLD_ARIA) === 1 &&
      occurrences(after, IMPORT) === 1 &&
      occurrences(after, EXPRESSION) === 1 &&
      occurrences(after, OLD_ARIA) === 0,
    "ITACARE_RECIPE_CARDINALITY_INVALID",
  );
  const reversed = Buffer.from(
    after.replace(IMPORT, "").replace(EXPRESSION, OLD_ARIA),
  );
  requireThat(
    reversed.equals(snapshot.baseFiles[ENTRY].bytes),
    "ITACARE_RECIPE_REVERSAL_MISMATCH",
  );
  return Object.freeze({
    schemaVersion: 1,
    classification: "NEUTRAL_DISCOVER_CATEGORY_ARIA_V1",
    activated: false,
    baseSha: snapshot.baseSha,
    headSha: snapshot.headSha,
    headTreeSha: snapshot.headTreeSha,
    originalChangedActivationPaths: changed,
    reversedEntrySha256: hash(reversed),
    sources: Object.fromEntries(
      SNAPSHOT_PATHS.map((path) => [
        path,
        {
          base: fileIdentity(snapshot.baseFiles[path]),
          head: fileIdentity(snapshot.headFiles[path]),
        },
      ]),
    ),
    limits:
      "Only the closed two-edit localization recipe. Existing scoped Place, server, SQL and complete-activation gates remain authoritative.",
  });
}

function runGit(root, args) {
  const result = spawnSync("git", [...RAW_GIT, "-C", root, ...args], {
    encoding: null,
    maxBuffer: 2 * MAX_BYTES,
    timeout: 10000,
  });
  requireThat(
    !result.error && result.status === 0,
    "ITACARE_GIT_COMMAND_FAILED",
  );
  return result.stdout;
}

function gitText(root, args) {
  return runGit(root, args).toString("utf8").trim();
}

function assertRawHistory(root) {
  requireThat(
    !Object.hasOwn(process.env, "GIT_GRAFT_FILE"),
    "ITACARE_GRAFTS_DENIED",
  );
  const path = resolve(
    root,
    gitText(root, ["rev-parse", "--git-path", "info/grafts"]),
  );
  requireThat(statOrAbsent(path) === null, "ITACARE_GRAFTS_DENIED");
}

function statOrAbsent(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function physicalFile(root, path) {
  let current = root;
  const components = path.split("/");
  for (const [index, component] of components.entries()) {
    current = resolve(current, component);
    const stat = statOrAbsent(current);
    if (stat === null) return null;
    requireThat(!stat.isSymbolicLink(), "ITACARE_PHYSICAL_SOURCE_INVALID");
    if (index < components.length - 1) {
      requireThat(stat.isDirectory(), "ITACARE_PHYSICAL_SOURCE_INVALID");
      continue;
    }
    requireThat(
      stat.isFile() && stat.size <= MAX_BYTES && (stat.mode & 0o111) === 0,
      "ITACARE_PHYSICAL_SOURCE_INVALID",
    );
    const fd = openSync(
      current,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const opened = fstatSync(fd);
      requireThat(
        opened.isFile() &&
          opened.dev === stat.dev &&
          opened.ino === stat.ino &&
          opened.size <= MAX_BYTES &&
          (opened.mode & 0o111) === 0,
        "ITACARE_PHYSICAL_SOURCE_INVALID",
      );
      const bytes = readFileSync(fd);
      const after = lstatSync(current);
      requireThat(
        after.isFile() &&
          after.dev === opened.dev &&
          after.ino === opened.ino &&
          after.mode === opened.mode &&
          after.size === bytes.length &&
          bytes.length === opened.size,
        "ITACARE_PHYSICAL_SOURCE_INVALID",
      );
      return bytes;
    } finally {
      closeSync(fd);
    }
  }
  throw new Error("ITACARE_PHYSICAL_SOURCE_INVALID");
}

function assertPhysicalSources(root, files) {
  for (const path of SNAPSHOT_PATHS) {
    const bytes = physicalFile(root, path);
    requireThat(
      files[path] === null
        ? bytes === null
        : bytes !== null && bytes.equals(files[path].bytes),
      "ITACARE_PHYSICAL_HEAD_MISMATCH",
    );
  }
}

function currentIdentity(root) {
  assertRawHistory(root);
  requireThat(
    gitText(root, ["status", "--porcelain=v1", "--untracked-files=normal"]) ===
      "",
    "ITACARE_WORKTREE_NOT_CLEAN",
  );
  return {
    headSha: gitText(root, ["rev-parse", "--verify", "HEAD"]),
    headTreeSha: gitText(root, ["rev-parse", "--verify", "HEAD^{tree}"]),
  };
}

export function assertCapturedHeadUnchanged(root, snapshot) {
  const current = currentIdentity(root);
  requireThat(
    current.headSha === snapshot.headSha &&
      current.headTreeSha === snapshot.headTreeSha,
    "ITACARE_CURRENT_HEAD_MISMATCH",
  );
  assertPhysicalSources(root, snapshot.headFiles);
}

function captureFiles(root, sha, paths = SNAPSHOT_PATHS) {
  const output = runGit(root, [
    "--literal-pathspecs",
    "ls-tree",
    "-z",
    sha,
    "--",
    ...paths,
  ]);
  const files = Object.fromEntries(paths.map((path) => [path, null]));
  const seen = new Set();
  for (const line of output.toString("utf8").split("\0").filter(Boolean)) {
    const match = /^([0-7]{6}) (blob|tree|commit) ([a-f0-9]{40})\t(.+)$/u.exec(
      line,
    );
    requireThat(
      match && paths.includes(match[4]) && !seen.has(match[4]),
      "ITACARE_GIT_TREE_ENTRY_INVALID",
    );
    const [, mode, type, oid, path] = match;
    requireThat(
      mode === "100644" && type === "blob",
      "ITACARE_SOURCE_MODE_INVALID",
    );
    seen.add(path);
    const size = Number(gitText(root, ["cat-file", "-s", oid]));
    requireThat(
      Number.isSafeInteger(size) && size >= 0 && size <= MAX_BYTES,
      "ITACARE_SOURCE_BYTES_INVALID",
    );
    const bytes = runGit(root, ["cat-file", "blob", oid]);
    requireThat(bytes.length === size, "ITACARE_BLOB_SIZE_MISMATCH");
    files[path] = { mode, type, oid, bytes };
  }
  return files;
}

export function captureSnapshot(root, baseSha, headSha) {
  assertRawHistory(root);
  requireThat(
    SHA.test(baseSha) && SHA.test(headSha),
    "ITACARE_SOURCE_SHA_INVALID",
  );
  requireThat(
    gitText(root, ["rev-parse", "--show-toplevel"]) === realpathSync(root),
    "ITACARE_WORKTREE_ROOT_REQUIRED",
  );
  requireThat(
    gitText(root, ["rev-parse", "--verify", baseSha + "^{commit}"]) ===
      baseSha &&
      gitText(root, ["rev-parse", "--verify", headSha + "^{commit}"]) ===
        headSha,
    "ITACARE_SOURCE_SHA_INVALID",
  );
  const current = currentIdentity(root);
  requireThat(current.headSha === headSha, "ITACARE_CURRENT_HEAD_MISMATCH");
  // Exit 1 is not ancestry; every other nonzero exit is a Git failure, never a diff.
  const ancestry = spawnSync(
    "git",
    [...RAW_GIT, "-C", root, "merge-base", "--is-ancestor", baseSha, headSha],
    { timeout: 10000 },
  );
  requireThat(
    !ancestry.error && [0, 1].includes(ancestry.status),
    "ITACARE_GIT_COMMAND_FAILED",
  );
  requireThat(ancestry.status === 0, "ITACARE_BASE_NOT_ANCESTOR");
  const snapshot = {
    baseSha,
    headSha,
    headTreeSha: current.headTreeSha,
    baseFiles: captureFiles(root, baseSha),
    headFiles: captureFiles(root, headSha),
  };
  assertCapturedHeadUnchanged(root, snapshot);
  return snapshot;
}

function createReceipt(path, receipt) {
  requireThat(isAbsolute(path), "ITACARE_RECEIPT_ABSOLUTE_PATH_REQUIRED");
  let parent = parse(path).root;
  for (const component of dirname(path)
    .slice(parent.length)
    .split(sep)
    .filter(Boolean)) {
    parent = resolve(parent, component);
    const stat = lstatSync(parent);
    requireThat(
      stat.isDirectory() && !stat.isSymbolicLink(),
      "ITACARE_RECEIPT_PARENT_INVALID",
    );
  }
  const fd = openSync(path, "wx", 0o600);
  try {
    writeFileSync(fd, JSON.stringify(receipt, null, 2) + "\n");
  } finally {
    closeSync(fd);
  }
}

function bindBaseValidator(root, baseSha) {
  assertRawHistory(root);
  const file = captureFiles(root, baseSha, [VALIDATOR])[VALIDATOR];
  requireThat(file !== null, "ITACARE_BASE_VALIDATOR_ABSENT");
  requireThat(
    blobHash(file.bytes) === file.oid,
    "ITACARE_BLOB_IDENTITY_INVALID",
  );
  const executed = fileURLToPath(import.meta.url);
  const stat = lstatSync(executed);
  requireThat(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      stat.size <= MAX_BYTES &&
      readFileSync(executed).equals(file.bytes),
    "ITACARE_BASE_VALIDATOR_MISMATCH",
  );
  return { path: VALIDATOR, baseSha, ...fileIdentity(file) };
}

export function runMaintenanceProof(root, { baseSha, headSha, receiptPath }) {
  const validator = bindBaseValidator(root, baseSha);
  const snapshot = captureSnapshot(root, baseSha, headSha);
  const receipt = { ...classifyNeutralMaintenance(snapshot), validator };
  const recheck = () => {
    assert.deepEqual(
      bindBaseValidator(root, baseSha),
      validator,
      "ITACARE_BASE_VALIDATOR_MISMATCH",
    );
    assertCapturedHeadUnchanged(root, snapshot);
  };
  recheck();
  createReceipt(receiptPath, receipt);
  // A failed final recheck leaves historical bytes, but never returns success.
  recheck();
  return receipt;
}

function argumentsFrom(argv) {
  const values = {};
  requireThat(argv.length === 6, "ITACARE_ARGUMENTS_INVALID");
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    requireThat(
      ["--base", "--head", "--receipt"].includes(key) &&
        !Object.hasOwn(values, key) &&
        argv[i + 1],
      "ITACARE_ARGUMENTS_INVALID",
    );
    values[key] = argv[i + 1];
  }
  return {
    baseSha: values["--base"],
    headSha: values["--head"],
    receiptPath: values["--receipt"],
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(
      JSON.stringify(
        runMaintenanceProof(
          process.cwd(),
          argumentsFrom(process.argv.slice(2)),
        ),
      ),
    );
  } catch (error) {
    const code =
      String(error?.message ?? "").match(/ITACARE_[A-Z0-9_]+/u)?.[0] ??
      "ITACARE_NEUTRAL_MAINTENANCE_DENIED";
    console.error(code);
    process.exitCode = 1;
  }
}
