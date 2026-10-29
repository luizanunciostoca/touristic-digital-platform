import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, delimiter } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(join(repository, "package.json"));
const turbo = require.resolve("turbo/bin/turbo");
const candidate = JSON.parse(
  readFileSync(join(repository, "turbo.json"), "utf8"),
);
const generator = "tooling/ci/build-entry-css.mjs";
const manifest = "tooling/ci/entry-css-manifest.json";
const artifacts = ["home.css", "features.css", "build.json"];
const digest = (value) => createHash("sha256").update(value).digest("hex");

function exercise(config, corrected) {
  const root = mkdtempSync(join(tmpdir(), "entry-css-turbo-cache-"));
  const output = join(root, "packages/entry-css-fixture/public/dist/entry-css");
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (
      name.startsWith("GIT_") ||
      name.startsWith("TURBO_") ||
      ["NODE_OPTIONS", "NODE_PATH", "NODE_TEST_CONTEXT"].includes(name)
    )
      delete env[name];
  }
  Object.assign(env, {
    PATH: dirname(process.execPath) + delimiter + (process.env.PATH ?? ""),
    TURBO_TELEMETRY_DISABLED: "1",
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    COREPACK_ENABLE_NETWORK: "0",
    npm_config_manage_package_manager_versions: "false",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(root, ".fixture-git-config"),
  });
  function write(path, value) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), value);
  }
  function run(command, args) {
    try {
      return execFileSync(
        command,
        command === "git"
          ? [
              "-c",
              "core.hooksPath=" + join(root, ".no-hooks"),
              "-c",
              "commit.gpgSign=false",
              ...args,
            ]
          : args,
        {
          cwd: root,
          env,
          encoding: "utf8",
          timeout: 30000,
          maxBuffer: 4 * 1024 * 1024,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    } catch (error) {
      throw new Error(
        "Fixture command failed: " +
          command +
          "\n" +
          String(error.stdout ?? "") +
          "\n" +
          String(error.stderr ?? ""),
        { cause: error },
      );
    }
  }
  const args = [
    turbo,
    "run",
    "build",
    "--cache=local:rw",
    "--cache-dir=.turbo/cache",
    "--output-logs=full",
  ];
  const build = () => run(process.execPath, args);
  const hash = () => {
    const graph = JSON.parse(run(process.execPath, [...args, "--dry=json"]));
    assert.equal(graph.tasks.length, 1);
    return graph.tasks[0].hash;
  };
  const count = () => Number(readFileSync(join(root, ".executions"), "utf8"));
  const outputs = () =>
    Object.fromEntries(
      artifacts.map((name) => [name, digest(readFileSync(join(output, name)))]),
    );
  try {
    write(".fixture-git-config", "");
    write(
      ".gitignore",
      "node_modules/\n.turbo/\n.executions\n.fixture-git-config\n**/public/dist/\n",
    );
    write(
      "package.json",
      JSON.stringify({
        name: "entry-css-cache-regression",
        private: true,
        packageManager: "pnpm@10.15.0",
      }),
    );
    write("pnpm-workspace.yaml", "packages:\n  - packages/*\n");
    write(
      "pnpm-lock.yaml",
      "lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\nimporters:\n  .: {}\n  packages/entry-css-fixture: {}\n",
    );
    write("eslint.config.mjs", "export default [];\n");
    write("tsconfig.base.json", "{}\n");
    write("turbo.json", JSON.stringify(config));
    write(
      "packages/entry-css-fixture/package.json",
      JSON.stringify({
        name: "entry-css-fixture",
        version: "1.0.0",
        private: true,
        scripts: { build: "node ../../tooling/ci/build-entry-css.mjs" },
      }),
    );
    write(manifest, JSON.stringify({ theme: "red" }));
    const producer = `import assert from 'node:assert/strict';
import fs from 'node:fs';import {fileURLToPath} from 'node:url';import path from 'node:path';
assert.equal(process.execPath,${JSON.stringify(process.execPath)});
const root=fileURLToPath(new URL('../../',import.meta.url));
const revision='generator-v1';
const data=JSON.parse(fs.readFileSync(path.join(root,'${manifest}'),'utf8'));
const out=path.join(root,'packages/entry-css-fixture/public/dist/entry-css');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'home.css'),'/*'+revision+'*/.home{color:'+data.theme+'}');
fs.writeFileSync(path.join(out,'features.css'),'/*'+revision+'*/.feature{color:'+data.theme+'}');
fs.writeFileSync(path.join(out,'build.json'),JSON.stringify({revision,...data}));
const counter=path.join(root,'.executions');
fs.writeFileSync(counter,String((fs.existsSync(counter)?Number(fs.readFileSync(counter,'utf8')):0)+1));
`;
    write(generator, producer);
    run("git", ["init", "--quiet"]);
    run("git", ["add", "."]);
    run("git", [
      "-c",
      "user.name=Cache Regression",
      "-c",
      "user.email=cache-regression@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "fixture",
    ]);
    const baselineHash = hash();
    build();
    assert.equal(count(), 1);
    const baseline = outputs();
    rmSync(output, { recursive: true });
    const restored = build();
    assert.match(restored, /cache hit/u);
    assert.match(restored, /1 cached, 1 total/u);
    assert.equal(count(), 1, "cache hit must not execute the producer");
    if (corrected)
      assert.deepEqual(
        outputs(),
        baseline,
        "all three CSS artifacts must be restored byte for byte",
      );
    else
      for (const name of artifacts)
        assert.equal(
          existsSync(join(output, name)),
          false,
          "negative control must reproduce missing output",
        );
    write(generator, producer.replace("generator-v1", "generator-v2"));
    const generatorHash = hash();
    if (corrected)
      assert.notEqual(
        generatorHash,
        baselineHash,
        "generator changes must invalidate the key",
      );
    else
      assert.equal(
        generatorHash,
        baselineHash,
        "negative control reproduces stale generator key",
      );
    build();
    assert.equal(count(), corrected ? 2 : 1);
    const afterGenerator = corrected ? outputs() : null;
    if (corrected)
      for (const name of artifacts)
        assert.notEqual(afterGenerator[name], baseline[name]);
    write(manifest, JSON.stringify({ theme: "blue" }));
    const manifestHash = hash();
    if (corrected)
      assert.notEqual(
        manifestHash,
        generatorHash,
        "manifest changes must invalidate the key",
      );
    else
      assert.equal(
        manifestHash,
        generatorHash,
        "negative control reproduces stale manifest key",
      );
    build();
    assert.equal(count(), corrected ? 3 : 1);
    if (corrected) {
      const afterManifest = outputs();
      for (const name of artifacts)
        assert.notEqual(afterManifest[name], afterGenerator[name]);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test(
  "real Turbo cache restores entry CSS and invalidates generator and manifest independently",
  { timeout: 180000 },
  () => {
    assert.ok(candidate.globalDependencies.includes(generator));
    assert.ok(candidate.globalDependencies.includes(manifest));
    assert.ok(
      candidate.tasks.build.outputs.includes("public/dist/entry-css/**"),
    );
    const previous = structuredClone(candidate);
    previous.globalDependencies = previous.globalDependencies.filter(
      (path) => ![generator, manifest].includes(path),
    );
    previous.tasks.build.outputs = previous.tasks.build.outputs.filter(
      (path) => path !== "public/dist/entry-css/**",
    );
    exercise(previous, false);
    exercise(candidate, true);
  },
);
