import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function validateRuntimeImageContract({ dockerfile, scanner, release }) {
  assert.match(
    dockerfile,
    /FROM gcr[.]io\/distroless\/nodejs22-debian13:nonroot AS production/u,
  );
  assert.doesNotMatch(dockerfile, /FROM node:[^\n]+ AS production/u);
  assert.match(
    dockerfile,
    /COPY --from=build --chown=65532:65532 \/app \/app/u,
  );
  assert.match(dockerfile, /USER 65532:65532/u);
  assert.match(
    dockerfile,
    /CMD \["apps\/morro-digital-platform\/tooling\/dev-server[.]mjs"\]/u,
  );
  assert.match(scanner, /^  pull_request:\s*\n    paths:/mu);
  assert.match(scanner, /^      - "Dockerfile"$/mu);
  const milestones = [
    "Build and publish immutable image",
    "Verify immutable registry digest",
    "Smoke the exact immutable release digest",
    "Scan immutable digest for embedded secrets",
    "Scan immutable digest for HIGH and CRITICAL vulnerabilities",
    "Write release provenance",
  ];
  let position = -1;
  for (const milestone of milestones) {
    const next = release.indexOf("      - name: " + milestone);
    assert.ok(
      next > position,
      "RELEASE_IMAGE_GATE_MISSING_OR_OUT_OF_ORDER:" + milestone,
    );
    position = next;
  }
  const digestInput =
    "image-ref: $" +
    "{{ steps.publish.outputs.image }}@$" +
    "{{ steps.publish.outputs.digest }}";
  assert.equal(
    release.split(digestInput).length - 1,
    2,
    "RELEASE_IMAGE_DIGEST_SCAN_MISSING",
  );
  assert.match(release, /severity: HIGH,CRITICAL[\s\S]*?exit-code: "1"/u);
  assert.match(release, /\$IMAGE_REPOSITORY@\$DIGEST/u);
  return { status: "PASS", milestones };
}

export function readRuntimeImageContract(root = process.cwd()) {
  const read = (path) => readFileSync(resolve(root, path), "utf8");
  return {
    dockerfile: read("Dockerfile"),
    scanner: read(".github/workflows/security-scanning.yml"),
    release: read(".github/workflows/release-oci-image.yml"),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const result = validateRuntimeImageContract(readRuntimeImageContract());
  process.stdout.write(JSON.stringify(result) + "\n");
}
