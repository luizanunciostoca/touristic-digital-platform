import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const checker = "tooling/quality/check-release-readiness.mjs";
const source = fs.readFileSync(path.join(root, checker), "utf8");
const files = [
  checker,
  "tooling/quality/release-container-entrypoint.mjs",
  ...[...source.matchAll(/text\("([^"\n]+)"\)/gu)].map((m) => m[1]),
];
const original = fs.readFileSync(
  path.join(root, "render.staging.yaml"),
  "utf8",
);
function imageBlueprint(value) {
  return value
    .replace(
      "    runtime: node\n    repo: https://github.com/luizanunciostoca/touristic-digital-platform\n    branch: main",
      `    runtime: image\n    image:\n      url: ghcr.io/luizanunciostoca/morro-digital-v2@sha256:${"a".repeat(64)}`,
    )
    .replace(/^    buildCommand:.*\n/gmu, "")
    .replace(
      "    startCommand: node tooling/render/with-staging-mysql-env.mjs node",
      "    dockerCommand: /nodejs/bin/node tooling/render/with-staging-mysql-env.mjs /nodejs/bin/node",
    )
    .replace(
      "    preDeployCommand: node tooling/render/with-staging-mysql-env.mjs node",
      "    preDeployCommand: /nodejs/bin/node tooling/render/with-staging-mysql-env.mjs /nodejs/bin/node",
    );
}
function run(t, blueprint) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "staging-readiness-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(dir, file));
  }
  fs.writeFileSync(path.join(dir, "render.staging.yaml"), blueprint);
  return spawnSync(process.execPath, [path.join(dir, checker)], {
    cwd: dir,
    encoding: "utf8",
    timeout: 15000,
  });
}
test("readiness accepts current node staging and immutable OCI staging", (t) => {
  const image = imageBlueprint(original);
  const node = image
    .replace(
      /    runtime: image\n    image:\n      url: [^\n]+/u,
      "    runtime: node\n    repo: https://github.com/luizanunciostoca/touristic-digital-platform\n    branch: main",
    )
    .replace("    dockerCommand:", "    startCommand:")
    .replaceAll("/nodejs/bin/node", "node");
  assert.notEqual(node, image);
  for (const blueprint of [node, image]) {
    const result = run(t, blueprint);
    assert.equal(result.status, 0, result.stderr);
  }
});
for (const [label, mutate, error] of [
  [
    "mutable image",
    (s) => s.replace(/@sha256:[a-f0-9]{64}/u, ":latest"),
    /immutable OCI/,
  ],
  [
    "bare Node",
    (s) =>
      s.replace("preDeployCommand: /nodejs/bin/node", "preDeployCommand: node"),
    /exact preDeployCommand/,
  ],
  [
    "missing wrapper",
    (s) =>
      s.replace(
        "dockerCommand: /nodejs/bin/node tooling/render/with-staging-mysql-env.mjs /nodejs/bin/node",
        "dockerCommand: /nodejs/bin/node",
      ),
    /exact dockerCommand/,
  ],
  [
    "source build",
    (s) =>
      s.replace(
        "    runtime: image",
        "    runtime: image\n    buildCommand: pnpm build",
      ),
    /source-build directives/,
  ],
  [
    "unsupported runtime",
    (s) => s.replace("runtime: image", "runtime: python"),
    /node or image/,
  ],
])
  test(`readiness rejects ${label}`, (t) => {
    const fixture = imageBlueprint(original);
    const changed = mutate(fixture);
    assert.notEqual(changed, fixture);
    const result = run(t, changed);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, error);
  });
