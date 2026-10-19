import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateReleaseContainerEntrypoint } from "./release-container-entrypoint.mjs";

const canonical = readFileSync(
  new URL("../../Dockerfile", import.meta.url),
  "utf8",
);
// Exercise stable runtime fixtures independently of the current deploy image.
const legacy = canonical
  .replace(
    "FROM gcr.io/distroless/nodejs22-debian13:nonroot AS production",
    "FROM node:22.23.2-trixie-slim AS production",
  )
  .replace(
    "COPY --from=build --chown=65532:65532 /app /app",
    "COPY --from=build --chown=node:node /app /app",
  )
  .replace("USER 65532:65532", "USER node")
  .replace(
    'CMD ["apps/morro-digital-platform/tooling/dev-server.mjs"]',
    'CMD ["node", "apps/morro-digital-platform/tooling/dev-server.mjs"]',
  );
const modern = legacy
  .replace(
    "FROM node:22.23.2-trixie-slim AS production",
    "FROM gcr.io/distroless/nodejs22-debian13:nonroot AS production",
  )
  .replace(/RUN set -eux;[\s\S]*?(?=COPY --from=build)/u, "")
  .replace(
    "COPY --from=build --chown=node:node /app /app",
    "COPY --from=build --chown=65532:65532 /app /app",
  )
  .replace("USER node", "USER 65532:65532")
  .replace(
    'CMD ["node", "apps/morro-digital-platform/tooling/dev-server.mjs"]',
    'CMD ["apps/morro-digital-platform/tooling/dev-server.mjs"]',
  );

test("checked-in Dockerfile must match the exact trusted runtime contract", () => {
  const state = validateReleaseContainerEntrypoint(canonical);
  assert.ok(["node", "65532:65532"].includes(state.nonrootUser));
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
  assert.throws(
    () =>
      validateReleaseContainerEntrypoint(
        legacy.replace(
          'CMD ["node", "apps/morro-digital-platform/tooling/dev-server.mjs"]',
          'CMD ["apps/morro-digital-platform/tooling/dev-server.mjs"]',
        ),
      ),
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
