import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readRuntimeImageContract,
  validateRuntimeImageContract,
} from "./runtime-image-contract.mjs";

const current = readRuntimeImageContract();

test("the reviewed final runtime and release-digest gates are present", () => {
  assert.equal(validateRuntimeImageContract(current).status, "PASS");
});

test("restoring the vulnerable full Debian runtime fails closed", () => {
  assert.throws(() =>
    validateRuntimeImageContract({
      ...current,
      dockerfile: current.dockerfile.replace(
        "gcr.io/distroless/nodejs22-debian13:nonroot",
        "node:22.23.2-trixie-slim",
      ),
    }),
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
