import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pinnedGo =
  "golang:1.26.9-bookworm@sha256:d9c68c2c51161e12fd77e4c6320687c9cd86e1af1e3ad6e6cd63ff970641453c";
test("staging MySQL gosu source is rebuilt with patched immutable Go 1.26.9", () => {
  const source = readFileSync(
    "tooling/render/mysql-staging/Dockerfile",
    "utf8",
  );
  assert.ok(
    source.startsWith(
      "FROM " + pinnedGo + " AS gosu-builder" + String.fromCharCode(10),
    ),
  );
  assert.ok(source.includes("ARG GOSU_RELEASE_COMMIT=6456aaa"));
  assert.ok(source.includes("ARG GOSU_VERSION=1.19"));
  assert.ok(source.includes("CGO_ENABLED=0 go build"));
  assert.ok(
    source.includes("COPY --from=gosu-builder /out/gosu /usr/local/bin/gosu"),
  );
  assert.ok(source.includes("gosu nobody true"));
  assert.doesNotMatch(source, /^USER (?:root|mysql)$/mu);
});
