import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const image =
  "golang:1.26.9-bookworm@sha256:d9c68c2c51161e12fd77e4c6320687c9cd86e1af1e3ad6e6cd63ff970641453c";
for (const service of ["mysql-staging", "mysql-production"]) {
  test(
    service + ": gosu builder pins patched Go 1.26.9 image and source",
    () => {
      const dockerfile = readFileSync(
        "tooling/render/" + service + "/Dockerfile",
        "utf8",
      );
      assert.ok(
        dockerfile.startsWith(
          "FROM " + image + " AS gosu-builder" + String.fromCharCode(10),
        ),
      );
      assert.ok(dockerfile.includes("CGO_ENABLED=0 go build"));
      assert.ok(
        dockerfile.includes(
          "COPY --from=gosu-builder /out/gosu /usr/local/bin/gosu",
        ),
      );
      assert.ok(dockerfile.includes("gosu nobody true"));
      if (service === "mysql-staging") {
        assert.ok(dockerfile.includes("ARG GOSU_RELEASE_COMMIT=6456aaa"));
        assert.ok(dockerfile.includes("ARG GOSU_VERSION=1.19"));
      } else {
        assert.ok(
          dockerfile.includes(
            "ARG GOSU_COMMIT=6456aaa0f3c854d199d0f037f068eb97515b7513",
          ),
        );
        assert.ok(dockerfile.includes("git checkout --detach FETCH_HEAD"));
      }
      assert.doesNotMatch(dockerfile, /^USER (?:root|mysql)$/mu);
    },
  );
}
