import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { validateReleaseContainerEntrypoint } from "./release-container-entrypoint.mjs";

const canonical = readFileSync(
  new URL("../../Dockerfile", import.meta.url),
  "utf8",
);
// Historical entrypoint fixtures are independent of today's composed image.
// The separate current-image contract rejects these as release selections.
function historical(image, user, command) {
  return `FROM node:22.23.2-trixie-slim AS build
FROM ${image} AS production
ENV NODE_ENV=production MORRO_RELEASE_SHA=$MORRO_RELEASE_SHA
COPY --from=build --chown=${user} /app /app
USER ${user}
CMD ${JSON.stringify(command)}
`;
}
const script = "apps/morro-digital-platform/tooling/dev-server.mjs";
const legacy = historical("node:22.23.2-trixie-slim", "node", ["node", script]);
const modern = historical(
  "gcr.io/distroless/nodejs22-debian13:nonroot",
  "65532:65532",
  [script],
);

test("checked-in Dockerfile must match the exact trusted runtime contract", () => {
  const state = validateReleaseContainerEntrypoint(canonical);
  assert.equal(state.runtime, "scratch");
  assert.equal(state.nonrootUser, "65532:65532");
  assert.equal(state.composition, "alpine-3.22-pinned-node22");
});

test("scratch alone is not an accepted runtime composition", () => {
  assert.throws(
    () =>
      validateReleaseContainerEntrypoint(
        modern.replace(
          "gcr.io/distroless/nodejs22-debian13:nonroot",
          "scratch",
        ),
      ),
    /RELEASE_COMPOSITION_STAGES_MISSING/u,
  );
});

for (const [label, from, to] of [
  [
    "unpinned runtime donor",
    "alpine:3.22@sha256:2e0b81d60597f449baa56dc25d355367869d2dca4cd57e866f1e2b52af3eb55f",
    "alpine:3.22",
  ],
  ["old zlib package", "zlib=1.3.2-r1", "zlib=1.3.2-r0"],
  ["different Node package", "nodejs=22.23.4-r0", "nodejs=22.23.3-r0"],
  ["unpinned dependency", "zstd-libs=1.5.7-r0", "zstd-libs"],
  [
    "installer shell injection",
    "zstd-libs=1.5.7-r0",
    "zstd-libs=1.5.7-r0 && echo altered",
  ],
  [
    "different application ABI",
    "FROM runtime-source AS base",
    "FROM node:22.23.2-trixie-slim AS base",
  ],
  [
    "unexecuted composition",
    'RUN ["node", "/runtime-image-composition.mjs", "compose", "/runtime-root"]',
    "# composition omitted",
  ],
  [
    "unfiltered root filesystem",
    "COPY --from=runtime-root /runtime-root /",
    "COPY --from=runtime-source / /",
  ],
  [
    "missing final verifier",
    'RUN ["/nodejs/bin/node", "/app/tooling/quality/runtime-image-composition.mjs", "verify"]',
    "# verification omitted",
  ],
  ["root final user", "USER 65532:65532", "USER 0:0"],
  [
    "different executable",
    'ENTRYPOINT ["/nodejs/bin/node"]',
    'ENTRYPOINT ["/bin/sh"]',
  ],
  [
    "unaliased final stage",
    `CMD ["${script}"]`,
    `CMD ["${script}"]\nFROM alpine`,
  ],
]) {
  test(`composed runtime rejects ${label}`, () => {
    const changed = canonical.replace(from, to);
    assert.notEqual(changed, canonical);
    assert.throws(
      () => validateReleaseContainerEntrypoint(changed),
      /RELEASE_(?:COMPOSITION|FINAL)/u,
    );
  });
}

test("runtime bytes cannot be changed after final verification", () => {
  for (const extra of [
    "COPY --from=runtime-source /bin/busybox /bin/busybox",
    'RUN ["/nodejs/bin/node", "-e", "process.exit(0)"]',
    "ENV NODE_OPTIONS=--require=/app/injected.cjs",
  ]) {
    assert.throws(
      () => validateReleaseContainerEntrypoint(canonical + extra + "\n"),
      /RELEASE_COMPOSITION_FINAL_CONTRACT_INVALID/u,
    );
  }
});

test("a comment ending in a backslash cannot hide an extra runtime COPY", () => {
  for (const newline of ["\n", "\r\n"]) {
    for (const comment of ["# ignored \\", " \t# ignored \\"]) {
      const changed = (
        canonical +
        `\n${comment}\nCOPY --from=runtime-source /bin/busybox /bin/busybox\n`
      ).replaceAll("\n", newline);
      assert.throws(
        () => validateReleaseContainerEntrypoint(changed),
        /RELEASE_COMPOSITION_FINAL_CONTRACT_INVALID/u,
      );
    }
  }
});

test("comments inside a continued instruction preserve its arguments", () => {
  const marker = "RUN apk add --no-cache \\\n";
  for (const comment of ["# package list", "# package list \\"]) {
    const changed = canonical.replace(marker, `${marker}    ${comment}\n`);
    assert.notEqual(changed, canonical);
    for (const newline of ["\n", "\r\n"]) {
      assert.deepEqual(
        validateReleaseContainerEntrypoint(changed.replaceAll("\n", newline)),
        validateReleaseContainerEntrypoint(canonical),
      );
    }
  }
});

test("readiness validator remains usable as one standalone copied module", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "release-validator-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const isolated = join(directory, "validator.mjs");
  copyFileSync(
    new URL("./release-container-entrypoint.mjs", import.meta.url),
    isolated,
  );
  const module = await import(pathToFileURL(isolated).href);
  assert.equal(
    module.validateReleaseContainerEntrypoint(canonical).runtime,
    "scratch",
  );
});

test("existing Node 22 runtime continues to satisfy exact nonroot readiness", () => {
  assert.equal(validateReleaseContainerEntrypoint(legacy).nonrootUser, "node");
});
test("distroless Node runtime is accepted only with its native Node entrypoint", () => {
  assert.equal(
    validateReleaseContainerEntrypoint(modern).nonrootUser,
    "65532:65532",
  );
});
test("reject distroless image with legacy double-node command", () => {
  assert.throws(
    () =>
      validateReleaseContainerEntrypoint(
        modern.replace(
          'CMD ["apps/morro-digital-platform/tooling/dev-server.mjs"]',
          'CMD ["node", "apps/morro-digital-platform/tooling/dev-server.mjs"]',
        ),
      ),
    /RELEASE_RUNTIME_COMMAND_MISMATCH/u,
  );
});
test("reject Node standard image with distroless command", () => {
  const changed = legacy.replace(
    `CMD ${JSON.stringify(["node", script])}`,
    `CMD ${JSON.stringify([script])}`,
  );
  assert.notEqual(changed, legacy);
  assert.throws(
    () => validateReleaseContainerEntrypoint(changed),
    /RELEASE_RUNTIME_COMMAND_MISMATCH/u,
  );
});
test("reject root privilege, unknown runtime and missing SHA", () => {
  assert.throws(
    () =>
      validateReleaseContainerEntrypoint(
        modern.replace("USER 65532:65532", "USER root"),
      ),
    /RELEASE_NONROOT_USER_MISMATCH/u,
  );
  assert.throws(
    () =>
      validateReleaseContainerEntrypoint(
        modern.replace(
          "gcr.io/distroless/nodejs22-debian13:nonroot",
          "example.com/node:latest",
        ),
      ),
    /RELEASE_BASE_IMAGE_UNTRUSTED/u,
  );
  assert.throws(
    () =>
      validateReleaseContainerEntrypoint(
        modern.replace(
          "MORRO_RELEASE_SHA=$MORRO_RELEASE_SHA",
          "MORRO_RELEASE_SHA=unknown",
        ),
      ),
    /RELEASE_SHA_IDENTITY_MISSING/u,
  );
});
test("reject injected ENTRYPOINT, extra final stage and distroless shell RUN", () => {
  assert.throws(
    () => validateReleaseContainerEntrypoint(modern + '\nENTRYPOINT ["sh"]\n'),
    /RELEASE_ENTRYPOINT_OVERRIDE_FORBIDDEN/u,
  );
  assert.throws(
    () =>
      validateReleaseContainerEntrypoint(modern + "\nFROM alpine AS rogue\n"),
    /RELEASE_FINAL_STAGE_NOT_PRODUCTION/u,
  );
  assert.throws(
    () => validateReleaseContainerEntrypoint(modern + "\nRUN echo unsafe\n"),
    /RELEASE_DISTROLESS_RUN_FORBIDDEN/u,
  );
});
