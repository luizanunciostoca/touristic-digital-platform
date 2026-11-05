import assert from "node:assert/strict";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  apkChecksum,
  appendNonrootIdentity,
  copyPackagePayloads,
  parseInstalledDatabase,
  readCheckedPayload,
  selectRuntimeRecords,
  validatePayloadAcl,
} from "./runtime-image-composition.mjs";

const identity =
  "C:Q1AAAAAAAAAAAAAAAAAAAAAAAAAAA=\nP:fixture\nV:1-r0\nA:x86_64\nD:original-maintenance-dependency /bin/sh\n";
const fixtureUid = process.getuid();
const fixtureGid = process.getgid();
const fixtureAcl = (mode) => `${fixtureUid}:${fixtureGid}:${mode}`;
const fileRecord = (content = "payload") =>
  identity +
  "F:usr\nM:" +
  fixtureAcl("755") +
  "\nF:usr/lib\nM:" +
  fixtureAcl("755") +
  "\nR:libfixture.so.1.0\na:" +
  fixtureAcl("755") +
  "\nZ:" +
  apkChecksum(content) +
  "\n" +
  "R:libfixture.so.1\na:" +
  fixtureAcl("777") +
  "\nZ:" +
  apkChecksum("libfixture.so.1.0") +
  "\n";

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "runtime-composition-fixture-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const sourceRoot = join(dir, "source");
  const targetRoot = join(dir, "target");
  mkdirSync(join(sourceRoot, "usr/lib"), { recursive: true });
  mkdirSync(targetRoot);
  writeFileSync(join(sourceRoot, "usr/lib/libfixture.so.1.0"), "payload", {
    mode: 0o755,
  });
  chmodSync(join(sourceRoot, "usr/lib/libfixture.so.1.0"), 0o755);
  symlinkSync("libfixture.so.1.0", join(sourceRoot, "usr/lib/libfixture.so.1"));
  return {
    sourceRoot,
    targetRoot,
    records: [...parseInstalledDatabase(fileRecord()).values()],
  };
}

test("APK parser preserves genuine record text and resets F/R ACL context", () => {
  const raw =
    fileRecord() + "F:etc\nM:0:0:750\nR:data\nZ:" + apkChecksum("data") + "\n";
  const [record] = parseInstalledDatabase(raw).values();
  assert.equal(record.raw, raw.trimEnd());
  assert.match(record.raw, /D:original-maintenance-dependency \/bin\/sh/u);
  assert.equal(record.directories.at(-1).mode, 0o750);
  assert.equal(record.files.at(-1).mode, 0o644);
  assert.equal(record.files.at(-1).path, "etc/data");
});

test("APK parser rejects traversal, duplicate identities, missing checksum and unsupported schemes", () => {
  assert.throws(
    () =>
      parseInstalledDatabase(fileRecord().replace("F:usr/lib", "F:../outside")),
    /APK_PATH_INVALID/u,
  );
  assert.throws(
    () =>
      parseInstalledDatabase(
        fileRecord().replace("R:libfixture.so.1.0", "R:subdir/file"),
      ),
    /APK_FILE_BASENAME_INVALID/u,
  );
  assert.throws(
    () => parseInstalledDatabase(fileRecord() + "\n" + fileRecord()),
    /APK_PACKAGE_DUPLICATE/u,
  );
  assert.throws(
    () => parseInstalledDatabase(fileRecord().replace(/^Z:.*\n/mu, "")),
    /APK_FILE_CHECKSUM_MISSING/u,
  );
  assert.throws(
    () => parseInstalledDatabase(fileRecord().replace(/^Z:Q1/mu, "Z:X9")),
    /APK_CHECKSUM_SCHEME_UNSUPPORTED/u,
  );
});

test("selected package requires exact version, control checksum and architecture", () => {
  const records = parseInstalledDatabase(fileRecord());
  const expected = { fixture: ["1-r0", "Q1AAAAAAAAAAAAAAAAAAAAAAAAAAA="] };
  assert.equal(selectRuntimeRecords(records, expected).length, 1);
  assert.throws(
    () =>
      selectRuntimeRecords(records, { fixture: ["2-r0", expected.fixture[1]] }),
    /RUNTIME_PACKAGE_IDENTITY_MISMATCH/u,
  );
  assert.throws(
    () =>
      selectRuntimeRecords(records, {
        fixture: ["1-r0", "Q1BBBBBBBBBBBBBBBBBBBBBBBBBBB="],
      }),
    /RUNTIME_PACKAGE_IDENTITY_MISMATCH/u,
  );
  assert.throws(
    () => selectRuntimeRecords(records, { missing: expected.fixture }),
    /RUNTIME_PACKAGE_MISSING/u,
  );
});

test("payload composition preserves complete owned files, symlink text and genuine metadata", (t) => {
  const context = fixture(t);
  const ownership = copyPackagePayloads(context);
  assert.equal(ownership.size, 2);
  assert.equal(
    readFileSync(join(context.targetRoot, "usr/lib/libfixture.so.1.0"), "utf8"),
    "payload",
  );
  assert.equal(
    readlinkSync(join(context.targetRoot, "usr/lib/libfixture.so.1")),
    "libfixture.so.1.0",
  );
  assert.equal(
    lstatSync(join(context.targetRoot, "usr/lib/libfixture.so.1.0")).mode &
      0o7777,
    0o755,
  );
  assert.match(
    context.records[0].raw,
    /D:original-maintenance-dependency \/bin\/sh/u,
  );
});

test("changed regular bytes fail before being retained", (t) => {
  const context = fixture(t);
  writeFileSync(
    join(context.sourceRoot, "usr/lib/libfixture.so.1.0"),
    "changed",
  );
  assert.throws(() => copyPackagePayloads(context), /RUNTIME_FILE_CHECKSUM/u);
});

test("symlink checksum uses link text, so dereferenced bytes cannot conceal retargeting", (t) => {
  const context = fixture(t);
  const entry = context.records[0].files[1];
  assert.equal(
    readCheckedPayload(context.sourceRoot, entry).bytes.toString(),
    "libfixture.so.1.0",
  );
  const path = join(context.sourceRoot, entry.path);
  rmSync(path);
  symlinkSync("./libfixture.so.1.0", path);
  assert.throws(
    () => readCheckedPayload(context.sourceRoot, entry),
    /RUNTIME_FILE_CHECKSUM/u,
  );
});

test("unexpected writable or executable permission change fails", (t) => {
  const context = fixture(t);
  chmodSync(join(context.sourceRoot, "usr/lib/libfixture.so.1.0"), 0o777);
  assert.throws(() => copyPackagePayloads(context), /RUNTIME_FILE_MODE/u);
});

test("only the exact package hostname bytes replace a transient Docker mount", (t) => {
  const context = fixture(t);
  mkdirSync(join(context.sourceRoot, "etc"));
  writeFileSync(
    join(context.sourceRoot, "etc/hostname"),
    "temporary-build-host\n",
    { mode: 0o644 },
  );
  const entry = {
    path: "etc/hostname",
    uid: fixtureUid,
    gid: fixtureGid,
    mode: 0o644,
    checksum: apkChecksum("localhost\n"),
  };
  assert.throws(
    () => readCheckedPayload(context.sourceRoot, entry),
    /RUNTIME_FILE_CHECKSUM/u,
  );
  assert.equal(
    readCheckedPayload(context.sourceRoot, entry, {
      canonical: true,
    }).bytes.toString(),
    "localhost\n",
  );
  assert.throws(
    () =>
      readCheckedPayload(
        context.sourceRoot,
        { ...entry, checksum: apkChecksum("different\n") },
        { canonical: true },
      ),
    /RUNTIME_FILE_CHECKSUM/u,
  );
});

test("shadow exception is bound to the exact official image configuration", (t) => {
  const context = fixture(t);
  mkdirSync(join(context.sourceRoot, "etc"));
  writeFileSync(
    join(context.sourceRoot, "etc/shadow"),
    "root:!:0:0:0:0:0:0:0\n",
    { mode: 0o640 },
  );
  const entry = {
    path: "etc/shadow",
    uid: fixtureUid,
    gid: fixtureGid,
    mode: 0o640,
    checksum: apkChecksum("root:!:0:0:0:0:0:0:0\n"),
  };
  assert.throws(
    () => readCheckedPayload(context.sourceRoot, entry),
    /RUNTIME_BASE_SHADOW_CHANGED/u,
  );
});

test("canonical shadow accepts only the pinned source ACL and preserves the original record", () => {
  const entry = { path: "etc/shadow", uid: 0, gid: 0, mode: 0o640 };
  const original = { ...entry };
  const source = { uid: 0, gid: 42, mode: 0o100640 };
  assert.equal(validatePayloadAcl(entry, source, { canonical: true }), source);
  assert.deepEqual(entry, original);
  for (const gid of [0, 41, 43]) {
    assert.throws(
      () => validatePayloadAcl(entry, { ...source, gid }, { canonical: true }),
      /RUNTIME_FILE_GID/u,
    );
  }
  assert.throws(
    () => validatePayloadAcl(entry, { ...source, uid: 1 }, { canonical: true }),
    /RUNTIME_FILE_UID/u,
  );
  assert.throws(
    () =>
      validatePayloadAcl(
        entry,
        { ...source, mode: 0o644 },
        { canonical: true },
      ),
    /RUNTIME_FILE_MODE/u,
  );
  assert.throws(
    () =>
      validatePayloadAcl({ ...entry, gid: 42 }, source, { canonical: true }),
    /RUNTIME_SHADOW_RECORD_ACL/u,
  );
  assert.throws(() => validatePayloadAcl(entry, source), /RUNTIME_FILE_GID/u);
  assert.doesNotThrow(() => validatePayloadAcl(entry, { ...source, gid: 0 }));
});

test("duplicate ownership across records fails instead of overwriting files", (t) => {
  const context = fixture(t);
  context.records.push({ ...context.records[0], P: "other-package" });
  assert.throws(
    () => copyPackagePayloads(context),
    /RUNTIME_FILE_OWNERSHIP_COLLISION/u,
  );
});

test("named nonroot overlays append to original passwd/group and reject identity collision", (t) => {
  const context = fixture(t);
  mkdirSync(join(context.targetRoot, "etc"));
  const passwd = "root:x:0:0:root:/root:/bin/ash\n";
  const group = "root:x:0:\n";
  writeFileSync(join(context.targetRoot, "etc/passwd"), passwd);
  writeFileSync(join(context.targetRoot, "etc/group"), group);
  appendNonrootIdentity(context.targetRoot);
  assert.equal(
    readFileSync(join(context.targetRoot, "etc/passwd"), "utf8"),
    passwd + "nonroot:x:65532:65532:nonroot:/home/nonroot:/sbin/nologin\n",
  );
  assert.equal(
    readFileSync(join(context.targetRoot, "etc/group"), "utf8"),
    group + "nonroot:x:65532:\n",
  );
  assert.throws(
    () => appendNonrootIdentity(context.targetRoot),
    /RUNTIME_ACCOUNT_ALREADY_PRESENT/u,
  );
});
