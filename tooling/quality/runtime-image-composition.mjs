import assert from "node:assert/strict";
import { createHash, X509Certificate } from "node:crypto";
import {
  chmodSync,
  chownSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { userInfo } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import { createSecureContext, getCACertificates } from "node:tls";
import { pathToFileURL } from "node:url";
import { deflateSync, gunzipSync, gzipSync, inflateSync } from "node:zlib";

// Captured signed Alpine v3.22 main/x86_64 APKINDEX, SHA256
// 2db789b7015a525ef86b5a9f0df71c8b960b76c9b72a79f56250db4292e7feba.
// Values are [version, signed-index control checksum]. apk remains responsible
// for signature verification. Copy real installer records without rewriting them.
export const runtimePackages = Object.freeze({
  "ada-libs": ["2.9.2-r4", "Q1Y97ATbuA2Gj+jy0ldBSn6bWO8CM="],
  "alpine-baselayout-data": ["3.7.0-r0", "Q1c/XvZfgzOheEEC35c8B21afVtf4="],
  "alpine-keys": ["2.5-r0", "Q1sXXkgUTrrQPWuhHUWyWq/C3jEME="],
  "alpine-release": ["3.22.8-r0", "Q1lRkMcRGR8SQmy/2M7WtRmt6XnDY="],
  "brotli-libs": ["1.1.1-r0", "Q1LpFEErEI6BMMnZ5l4ibooVWSfrQ="],
  "c-ares": ["1.34.9-r0", "Q11WDonk2bTpU63hLS3JdpXivBAcU="],
  "ca-certificates-bundle": ["20261020-r0", "Q1S0j4S2Jt6I+Ch50QIEvbuYBnpXs="],
  "icu-data-full": ["76.1-r1", "Q1SLq9KZUiyAqjYrd3+rpvzuA3iok="],
  "icu-libs": ["76.1-r1", "Q1ZqvKCUl2G2eHYg0U1RgeKu7Tdoc="],
  libcrypto3: ["3.5.9-r0", "Q1oh3VN2UxBgaVmtvnt5CjXfB97sk="],
  libgcc: ["14.2.0-r6", "Q1aUWRHcKxNIXpdGDZ3ycWrRoKoy0="],
  libssl3: ["3.5.9-r0", "Q1vg55k+/1wPY5bIUvUA2ERnX9nTc="],
  "libstdc++": ["14.2.0-r6", "Q17fXKwemP/k+zYJ9I3tg7Nb7BTJ0="],
  musl: ["1.2.5-r13", "Q1Kd1D3m57UuRVKkGgKHd5yKqNj0s="],
  "nghttp2-libs": ["1.69.0-r0", "Q1fwuEkacafZMCRajgY76tWWnN+tk="],
  nodejs: ["22.23.4-r0", "Q1lDcubCzMMtldKE5vRMWmDKlYKxg="],
  simdjson: ["3.12.0-r0", "Q1y6Rnh6NjlUzx4cMD3lejQH3QJo0="],
  simdutf: ["7.2.1-r0", "Q1Ig81T8yb4WRRkLuf4OB8lD34UKo="],
  "sqlite-libs": ["3.49.2-r1", "Q1yzGtJ1KT/55wX0HRyGJudxpYnkU="],
  tzdata: ["2026f-r0", "Q1HExDU9K4MpYGTrOCH5ilOhHPt7A="],
  zlib: ["1.3.2-r1", "Q1/4h5E7MrlBVDXCCuIDGXwWkzrzs="],
  "zstd-libs": ["1.5.7-r0", "Q1UMgxErVhn0jTbWkZCky3xx8Vx9I="],
});

const installedPath = "lib/apk/db/installed";
const manifestPath = "usr/share/morro/runtime-composition.json";
const shadowSha256 =
  "d5992a27f05f380fc5faeb82a3359e2f230fd1d6ea6517b45892b771a2194ddb";
const canonicalConfigs = Object.freeze({
  "etc/hostname": "localhost\n",
  "etc/hosts":
    "127.0.0.1\tlocalhost localhost.localdomain\n::1\t\tlocalhost localhost.localdomain\n",
});
const accountAppend = Object.freeze({
  "etc/passwd": "nonroot:x:65532:65532:nonroot:/home/nonroot:/sbin/nologin\n",
  "etc/group": "nonroot:x:65532:\n",
});
const forbiddenPaths = [
  "bin/sh",
  "bin/ash",
  "bin/bash",
  "bin/busybox",
  "bin/su",
  "sbin/apk",
  "usr/bin/sh",
  "usr/bin/bash",
  "usr/bin/su",
  "usr/bin/sudo",
  "usr/bin/apk",
  "usr/bin/npm",
  "usr/bin/npx",
  "usr/bin/pnpm",
  "usr/bin/corepack",
  "usr/local/bin/npm",
  "usr/local/bin/npx",
  "usr/local/bin/pnpm",
  "usr/local/bin/corepack",
  "usr/lib/node_modules/npm",
  "usr/local/lib/node_modules/npm",
];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const apkChecksum = (value) =>
  "Q1" + createHash("sha1").update(value).digest("base64");

function safeRelative(value, allowEmpty = false) {
  assert.equal(typeof value, "string", "APK_PATH_INVALID");
  assert.ok(
    (allowEmpty && value === "") ||
      (value &&
        !value.startsWith("/") &&
        !value.includes("\0") &&
        !value
          .split("/")
          .some((part) => !part || part === "." || part === "..")),
    "APK_PATH_INVALID:" + value,
  );
  return value;
}

function acl(value, fallbackMode) {
  if (!value) return { uid: 0, gid: 0, mode: fallbackMode };
  const match = /^(\d+):(\d+):([0-7]{3,4})$/u.exec(value);
  assert.ok(match, "APK_ACL_INVALID:" + value);
  return {
    uid: Number(match[1]),
    gid: Number(match[2]),
    mode: parseInt(match[3], 8),
  };
}

export function parseInstalledDatabase(text) {
  const records = new Map();
  for (const raw of text.trimEnd().split(/\n{2,}/u)) {
    if (!raw) continue;
    const record = { raw, directories: [], files: [] };
    let directory;
    let file;
    for (const line of raw.split("\n")) {
      assert.ok(line.length >= 2 && line[1] === ":", "APK_RECORD_LINE_INVALID");
      const field = line[0];
      const value = line.slice(2);
      if (["P", "V", "C", "A"].includes(field)) {
        assert.equal(record[field], undefined, "APK_IDENTITY_DUPLICATE");
        record[field] = value;
      } else if (field === "F") {
        directory = { path: safeRelative(value, true), ...acl(null, 0o755) };
        record.directories.push(directory);
        file = undefined;
      } else if (field === "M") {
        assert.ok(directory && !file, "APK_DIRECTORY_ACL_WITHOUT_DIRECTORY");
        Object.assign(directory, acl(value));
      } else if (field === "R") {
        assert.ok(directory, "APK_FILE_WITHOUT_DIRECTORY");
        safeRelative(value);
        assert.equal(value.includes("/"), false, "APK_FILE_BASENAME_INVALID");
        file = {
          path: safeRelative(posix.join(directory.path, value)),
          ...acl(null, 0o644),
        };
        record.files.push(file);
      } else if (field === "a") {
        assert.ok(file, "APK_FILE_ACL_WITHOUT_FILE");
        Object.assign(file, acl(value));
      } else if (field === "Z") {
        assert.ok(file && !file.checksum, "APK_FILE_CHECKSUM_INVALID");
        assert.match(
          value,
          /^Q1[A-Za-z0-9+/]{27}=$/u,
          "APK_CHECKSUM_SCHEME_UNSUPPORTED",
        );
        file.checksum = value;
      }
    }
    assert.ok(
      record.P && record.V && record.C && record.A,
      "APK_IDENTITY_MISSING",
    );
    assert.equal(
      records.has(record.P),
      false,
      "APK_PACKAGE_DUPLICATE:" + record.P,
    );
    assert.equal(
      new Set(record.files.map((entry) => entry.path)).size,
      record.files.length,
      "APK_FILE_DUPLICATE",
    );
    assert.ok(
      record.files.every((entry) => entry.checksum),
      "APK_FILE_CHECKSUM_MISSING",
    );
    records.set(record.P, record);
  }
  return records;
}

export function selectRuntimeRecords(records, expected = runtimePackages) {
  return Object.entries(expected).map(([name, identity]) => {
    const record = records.get(name);
    assert.ok(record, "RUNTIME_PACKAGE_MISSING:" + name);
    assert.deepEqual(
      [record.V, record.C],
      identity,
      "RUNTIME_PACKAGE_IDENTITY_MISMATCH:" + name,
    );
    assert.equal(record.A, "x86_64", "RUNTIME_ARCH_MISMATCH:" + name);
    return record;
  });
}

export function validatePayloadAcl(entry, actual, { canonical = false } = {}) {
  let expected = entry;
  if (canonical && entry.path === "etc/shadow") {
    assert.deepEqual(
      [entry.uid, entry.gid, entry.mode],
      [0, 0, 0o640],
      "RUNTIME_SHADOW_RECORD_ACL",
    );
    expected = { uid: 0, gid: 42, mode: 0o640 };
  }
  assert.equal(actual.uid, expected.uid, "RUNTIME_FILE_UID:" + entry.path);
  assert.equal(actual.gid, expected.gid, "RUNTIME_FILE_GID:" + entry.path);
  assert.equal(
    actual.mode & 0o7777,
    expected.mode,
    "RUNTIME_FILE_MODE:" + entry.path,
  );
  return actual;
}

function assertAcl(path, expected, options) {
  return validatePayloadAcl(expected, lstatSync(path), options);
}

export function readCheckedPayload(root, entry, { canonical = false } = {}) {
  const path = join(root, entry.path);
  const status = assertAcl(path, entry, { canonical });
  assert.ok(
    status.isFile() || status.isSymbolicLink(),
    "RUNTIME_FILE_TYPE:" + entry.path,
  );
  const bytes = status.isSymbolicLink()
    ? Buffer.from(readlinkSync(path))
    : canonical && Object.hasOwn(canonicalConfigs, entry.path)
      ? Buffer.from(canonicalConfigs[entry.path])
      : readFileSync(path);
  if (entry.path === "etc/shadow") {
    // Docker's pinned official Alpine base locks every account after package
    // installation. Preserve that stronger configuration and the original Z.
    assert.equal(sha256(bytes), shadowSha256, "RUNTIME_BASE_SHADOW_CHANGED");
    assert.ok(
      bytes
        .toString()
        .trim()
        .split("\n")
        .every((line) => /^[!*]/u.test(line.split(":")[1])),
      "RUNTIME_ACCOUNT_UNLOCKED",
    );
  } else {
    assert.equal(
      apkChecksum(bytes),
      entry.checksum,
      "RUNTIME_FILE_CHECKSUM:" + entry.path,
    );
  }
  return { bytes, symlink: status.isSymbolicLink() };
}

export function copyPackagePayloads({ sourceRoot, targetRoot, records }) {
  const owned = new Map();
  for (const record of records) {
    for (const entry of record.directories) {
      const target = join(targetRoot, entry.path);
      mkdirSync(target, { recursive: true, mode: entry.mode });
      assert.ok(
        lstatSync(target).isDirectory(),
        "RUNTIME_DIRECTORY_TYPE:" + entry.path,
      );
      chmodSync(target, entry.mode);
      chownSync(target, entry.uid, entry.gid);
    }
    for (const entry of record.files) {
      assert.equal(
        owned.has(entry.path),
        false,
        "RUNTIME_FILE_OWNERSHIP_COLLISION:" + entry.path,
      );
      const payload = readCheckedPayload(sourceRoot, entry, {
        canonical: true,
      });
      const target = join(targetRoot, entry.path);
      mkdirSync(dirname(target), { recursive: true });
      if (payload.symlink) symlinkSync(payload.bytes.toString(), target);
      else {
        writeFileSync(target, payload.bytes, { flag: "wx", mode: entry.mode });
        chmodSync(target, entry.mode);
        chownSync(target, entry.uid, entry.gid);
      }
      owned.set(entry.path, record.P);
    }
  }
  return owned;
}

export function appendNonrootIdentity(root) {
  for (const [relative, suffix] of Object.entries(accountAppend)) {
    const path = join(root, relative);
    const original = readFileSync(path, "utf8");
    assert.ok(original.endsWith("\n"), "RUNTIME_ACCOUNT_FILE_INVALID");
    assert.ok(
      original
        .trim()
        .split("\n")
        .every((line) => {
          const fields = line.split(":");
          return fields[0] !== "nonroot" && fields[2] !== "65532";
        }),
      "RUNTIME_ACCOUNT_ALREADY_PRESENT",
    );
    writeFileSync(path, original + suffix);
  }
}

function assertNoRuntimeTools(root) {
  for (const relative of forbiddenPaths) {
    assert.equal(
      lstatSync(join(root, relative), { throwIfNoEntry: false }),
      undefined,
      "RUNTIME_TOOL_FORBIDDEN:" + relative,
    );
  }
}

export function composeRuntimeRoot({ sourceRoot = "/", destination }) {
  assert.equal(process.getuid(), 0, "RUNTIME_COMPOSE_REQUIRES_ROOT");
  const target = resolve(destination);
  assert.notEqual(target, "/", "RUNTIME_COMPOSE_TARGET_INVALID");
  if (existsSync(target))
    assert.deepEqual(
      readdirSync(target),
      [],
      "RUNTIME_COMPOSE_TARGET_NOT_EMPTY",
    );
  else mkdirSync(target, { recursive: true });
  const records = selectRuntimeRecords(
    parseInstalledDatabase(
      readFileSync(join(sourceRoot, installedPath), "utf8"),
    ),
  );
  const owned = copyPackagePayloads({
    sourceRoot,
    targetRoot: target,
    records,
  });
  const database = records.map((record) => record.raw).join("\n\n") + "\n\n";
  mkdirSync(dirname(join(target, installedPath)), { recursive: true });
  writeFileSync(join(target, installedPath), database, { mode: 0o644 });
  appendNonrootIdentity(target);
  mkdirSync(join(target, "nodejs/bin"), { recursive: true });
  symlinkSync("/usr/bin/node", join(target, "nodejs/bin/node"));
  mkdirSync(join(target, "home/nonroot"), { recursive: true, mode: 0o755 });
  chownSync(join(target, "home/nonroot"), 65532, 65532);
  mkdirSync(join(target, "tmp"), { mode: 0o1777 });
  chmodSync(join(target, "tmp"), 0o1777);
  const manifest = {
    schemaVersion: 1,
    provenance:
      "Complete selected APK payloads and unchanged genuine apk installed records, with explicit container configuration overlays.",
    packageManagerClosure: false,
    excludedMaintenanceDependencies: [
      "nodejs:ca-certificates",
      "nodejs:/bin/sh",
    ],
    packages: records.map((record) => ({
      name: record.P,
      version: record.V,
      controlChecksum: record.C,
    })),
    installedDatabaseSha256: sha256(database),
    apkOwnedFileCount: owned.size,
    configurationOverlays: {
      "etc/shadow": {
        source: "pinned official Alpine base account locking",
        sha256: shadowSha256,
        sourceAcl: "0:42:0640",
        retainedAcl: "0:0:0640",
        aclNormalization:
          "Retain the genuine package record ACL; preserve the locked base-image contents.",
      },
      ...Object.fromEntries(
        Object.entries(accountAppend).map(([path, append]) => [
          path,
          { append },
        ]),
      ),
    },
    containerManagedFiles: ["etc/hosts", "etc/hostname"],
    alias: { path: "/nodejs/bin/node", target: "/usr/bin/node" },
  };
  mkdirSync(dirname(join(target, manifestPath)), { recursive: true });
  writeFileSync(
    join(target, manifestPath),
    JSON.stringify(manifest, null, 2) + "\n",
    { mode: 0o644 },
  );
  assertNoRuntimeTools(target);
  return {
    status: "PASS",
    phase: "compose",
    packageCount: records.length,
    apkOwnedFileCount: owned.size,
  };
}

function verifyReadablePayload(root, records) {
  const scope = {
    checkedFiles: 0,
    protectedFiles: [],
    containerManagedFiles: [],
  };
  for (const record of records) {
    for (const entry of record.files) {
      const path = join(root, entry.path);
      const status = assertAcl(path, entry);
      if (Object.hasOwn(canonicalConfigs, entry.path)) {
        assert.ok(status.isFile(), "RUNTIME_CONTAINER_CONFIG_TYPE");
        scope.containerManagedFiles.push(entry.path);
      } else if (entry.path === "etc/shadow") {
        assert.ok(
          status.isFile() &&
            entry.mode === 0o640 &&
            status.uid === 0 &&
            status.gid === 0,
          "RUNTIME_SHADOW_PROTECTION",
        );
        scope.protectedFiles.push(entry.path);
      } else if (Object.hasOwn(accountAppend, entry.path)) {
        const actual = readFileSync(path, "utf8");
        const suffix = accountAppend[entry.path];
        assert.ok(actual.endsWith(suffix), "RUNTIME_NONROOT_IDENTITY_MISSING");
        assert.equal(
          apkChecksum(actual.slice(0, -suffix.length)),
          entry.checksum,
          "RUNTIME_ACCOUNT_ORIGINAL_MODIFIED",
        );
        scope.checkedFiles += 1;
      } else {
        readCheckedPayload(root, entry);
        scope.checkedFiles += 1;
      }
    }
  }
  return scope;
}

export function verifyRuntime() {
  assert.equal(process.getuid(), 65532, "RUNTIME_UID_MISMATCH");
  assert.equal(process.getgid(), 65532, "RUNTIME_GID_MISMATCH");
  assert.equal(
    userInfo().username,
    "nonroot",
    "RUNTIME_NAMED_IDENTITY_MISSING",
  );
  assert.equal(process.versions.node, "22.23.4", "RUNTIME_NODE_VERSION");
  assert.equal(process.arch, "x64", "RUNTIME_ARCH");
  const database = readFileSync("/" + installedPath, "utf8");
  const parsed = parseInstalledDatabase(database);
  assert.equal(
    parsed.size,
    Object.keys(runtimePackages).length,
    "RUNTIME_UNDECLARED_PACKAGE",
  );
  const records = selectRuntimeRecords(parsed);
  const manifest = JSON.parse(readFileSync("/" + manifestPath, "utf8"));
  assert.equal(
    manifest.installedDatabaseSha256,
    sha256(database),
    "RUNTIME_DATABASE_CHANGED",
  );
  assert.equal(
    manifest.packageManagerClosure,
    false,
    "RUNTIME_METADATA_OVERCLAIM",
  );
  assert.equal(
    readlinkSync("/nodejs/bin/node"),
    "/usr/bin/node",
    "RUNTIME_NODE_ALIAS",
  );
  const fileScope = verifyReadablePayload("/", records);
  assertNoRuntimeTools("/");
  assert.equal(
    process.config.variables.node_shared_zlib,
    true,
    "RUNTIME_ZLIB_NOT_SHARED",
  );
  assert.equal(process.versions.zlib, "1.3.2", "RUNTIME_ZLIB_VERSION");
  const sharedObjects = process.report.getReport().sharedObjects;
  assert.ok(
    sharedObjects.some((path) => /\/libz[.]so[.]1(?:[.]\d+)*$/u.test(path)),
    "RUNTIME_ZLIB_NOT_LOADED",
  );
  const input = Buffer.from(
    "Morro Digital: compressão e descompressão.\n".repeat(256),
  );
  assert.deepEqual(
    gunzipSync(gzipSync(input)),
    input,
    "RUNTIME_GZIP_ROUNDTRIP",
  );
  assert.deepEqual(
    inflateSync(deflateSync(input)),
    input,
    "RUNTIME_DEFLATE_ROUNDTRIP",
  );
  assert.deepEqual(
    Intl.DateTimeFormat.supportedLocalesOf(["pt-BR", "es-ES", "fr-FR"]),
    ["pt-BR", "es-ES", "fr-FR"],
    "RUNTIME_FULL_ICU",
  );
  assert.equal(
    new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(
      new Date("2024-01-15T12:00:00Z"),
    ),
    "janeiro",
    "RUNTIME_PT_BR_ICU",
  );
  const zoned = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date("2024-01-15T12:00:00Z"));
  assert.equal(zoned, "09", "RUNTIME_TIMEZONE");
  const ca = readFileSync("/etc/ssl/certs/ca-certificates.crt", "utf8");
  const pem = ca.match(
    /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/gu,
  );
  assert.ok(pem && pem.length > 0, "RUNTIME_CA_BUNDLE_EMPTY");
  const certificates = pem.map((value) => new X509Certificate(value));
  assert.ok(
    certificates.every((certificate) => certificate.ca),
    "RUNTIME_CA_BUNDLE_INVALID",
  );
  createSecureContext({ ca, minVersion: "TLSv1.2" });
  assert.ok(
    getCACertificates("system").length > 0,
    "RUNTIME_SYSTEM_CA_NOT_LOADED",
  );
  return {
    status: "PASS",
    phase: "verify",
    node: process.versions.node,
    zlib: process.versions.zlib,
    sharedZlib: true,
    gzipRoundtrip: true,
    deflateRoundtrip: true,
    fullIcuPtBr: true,
    timezone: "America/Sao_Paulo",
    tlsTrustStoreParsed: true,
    tlsContextCreated: true,
    caCertificates: certificates.length,
    packageCount: records.length,
    uid: process.getuid(),
    gid: process.getgid(),
    ...fileScope,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [command, destination, ...extra] = process.argv.slice(2);
  assert.equal(extra.length, 0, "RUNTIME_COMPOSITION_ARGUMENTS_INVALID");
  let result;
  if (command === "compose" && destination)
    result = composeRuntimeRoot({ destination });
  else if (command === "verify" && !destination) result = verifyRuntime();
  else
    assert.fail(
      "USAGE: runtime-image-composition.mjs compose <directory> | verify",
    );
  process.stdout.write(JSON.stringify(result) + "\n");
}
