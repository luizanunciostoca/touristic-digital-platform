import { test } from "node:test";
import assert from "node:assert/strict";
import { validateReleaseContainerEntrypoint } from "../quality/release-container-entrypoint.mjs";
import {
  readRuntimeImageContract,
  validateRuntimeImageContract,
} from "./runtime-image-contract.mjs";

const current = readRuntimeImageContract();

test("the reviewed final runtime and release-digest gates are present", () => {
  assert.equal(validateRuntimeImageContract(current).status, "PASS");
});

for (const [image, user, command] of [
  [
    "node:22.23.2-trixie-slim",
    "node",
    ["node", "apps/morro-digital-platform/tooling/dev-server.mjs"],
  ],
  [
    "gcr.io/distroless/nodejs22-debian13:nonroot",
    "65532:65532",
    ["apps/morro-digital-platform/tooling/dev-server.mjs"],
  ],
]) {
  test(`historical ${image} entrypoint compatibility does not authorize the current release image`, () => {
    const dockerfile = `FROM node:22.23.2-trixie-slim AS build
FROM ${image} AS production
ENV NODE_ENV=production MORRO_RELEASE_SHA=$MORRO_RELEASE_SHA
COPY --from=build --chown=${user} /app /app
USER ${user}
CMD ${JSON.stringify(command)}
`;
    assert.equal(validateReleaseContainerEntrypoint(dockerfile).runtime, image);
    assert.throws(
      () => validateRuntimeImageContract({ ...current, dockerfile }),
      /RELEASE_COMPOSED_RUNTIME_REQUIRED/u,
    );
  });
}

test("a final image without actual exec-form composition verification fails closed", () => {
  const dockerfile = current.dockerfile.replace(
    'RUN ["/nodejs/bin/node", "/app/tooling/quality/runtime-image-composition.mjs", "verify"]',
    "# verification removed",
  );
  assert.notEqual(dockerfile, current.dockerfile);
  assert.throws(
    () => validateRuntimeImageContract({ ...current, dockerfile }),
    /RELEASE_COMPOSITION_FINAL_CONTRACT_INVALID/u,
  );
});

test("removing immutable digest scans fails closed", () => {
  assert.throws(() =>
    validateRuntimeImageContract({
      ...current,
      release: current.release.replace(
        "image-ref: $" +
          "{{ steps.publish.outputs.image }}@$" +
          "{{ steps.publish.outputs.digest }}",
        "image-ref: unverified:latest",
      ),
    }),
  );
});

test("provenance must follow every security and runtime acceptance gate", () => {
  assert.throws(() =>
    validateRuntimeImageContract({
      ...current,
      release: current.release.replace(
        "      - name: Write release provenance",
        "      - name: Premature release provenance",
      ),
    }),
  );
});

test("exact-head candidate image scan requires an explicitly scoped owner dispatch", () => {
  assert.throws(() =>
    validateRuntimeImageContract({
      ...current,
      scanner: current.scanner.replace("scan_scope:", "scan_scope_disabled:"),
    }),
  );
});

test("broad scanning must remain asynchronous to ordinary pull requests", () => {
  assert.throws(() =>
    validateRuntimeImageContract({
      ...current,
      scanner: current.scanner.replace("workflow_dispatch:", "pull_request:"),
    }),
  );
});
