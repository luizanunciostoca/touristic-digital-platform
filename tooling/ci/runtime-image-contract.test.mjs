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

test("candidate image security scan must run before merge", () => {
  assert.throws(() =>
    validateRuntimeImageContract({
      ...current,
      scanner: current.scanner.replace(
        "pull_request:",
        "never_on_pull_request:",
      ),
    }),
  );
});
