import assert from "node:assert/strict";

const expectedScript = "apps/morro-digital-platform/tooling/dev-server.mjs";
const runtimeSource =
  "alpine:3.22@sha256:2e0b81d60597f449baa56dc25d355367869d2dca4cd57e866f1e2b52af3eb55f";
const runtimeNode = "/nodejs/bin/node";
const compositionHelper = "tooling/quality/runtime-image-composition.mjs";
const runtimes = Object.freeze({
  "node:22.23.2-trixie-slim": {
    command: ["node", expectedScript],
    user: "node",
  },
  "gcr.io/distroless/nodejs22-debian13:nonroot": {
    command: [expectedScript],
    user: "65532:65532",
  },
});

// Keep this module standalone: staging readiness copies it into an isolated
// fixture. The composition helper performs the actual package/file/runtime
// assertions during the image build; this checks that its reviewed route runs.
function compositionStages(dockerfile) {
  assert.doesNotMatch(
    dockerfile,
    /^\s*#\s*(?:syntax|escape)\s*=/gimu,
    "RELEASE_COMPOSITION_PARSER_DIRECTIVE_UNSUPPORTED",
  );
  const stages = [];
  // Discard comment lines before joining continued instructions.
  const logical = dockerfile
    .replace(/\r\n/gu, "\n")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n")
    .replace(/\\\n[ \t]*/gu, " ");
  for (const raw of logical.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const instruction = /^([A-Z]+)[ \t]+(.+)$/u.exec(line);
    assert.ok(instruction, "RELEASE_COMPOSITION_INSTRUCTION_INVALID");
    const [, name, body] = instruction;
    if (name === "FROM") {
      const from = /^(\S+)[ \t]+AS[ \t]+([a-z][a-z0-9-]*)$/u.exec(body);
      assert.ok(from, "RELEASE_COMPOSITION_STAGE_INVALID");
      assert.equal(
        stages.some((stage) => stage.name === from[2]),
        false,
        "RELEASE_COMPOSITION_STAGE_DUPLICATE",
      );
      stages.push({ image: from[1], name: from[2], instructions: [] });
    } else {
      assert.ok(stages.length, "RELEASE_COMPOSITION_GLOBAL_INSTRUCTION");
      stages.at(-1).instructions.push({ name, body });
    }
  }
  return stages;
}

function requireInstructions(actual, expected, code) {
  assert.equal(actual.length, expected.length, code);
  for (const [index, [name, body]] of expected.entries()) {
    assert.equal(actual[index].name, name, code);
    if (Array.isArray(body)) {
      let parsed;
      try {
        parsed = JSON.parse(actual[index].body);
      } catch {
        assert.fail(code);
      }
      assert.deepEqual(parsed, body, code);
    } else {
      assert.equal(actual[index].body.replace(/[ \t]+/gu, " "), body, code);
    }
  }
}

function validateComposedRuntime(dockerfile) {
  const stages = compositionStages(dockerfile);
  const stage = (name) => stages.find((item) => item.name === name);
  const source = stage("runtime-source"),
    root = stage("runtime-root");
  const base = stage("base"),
    build = stage("build");
  const production = stages.at(-1);
  assert.ok(
    source && root && base && build,
    "RELEASE_COMPOSITION_STAGES_MISSING",
  );
  assert.equal(
    source.image,
    runtimeSource,
    "RELEASE_COMPOSITION_SOURCE_UNTRUSTED",
  );
  assert.equal(
    root.image,
    "runtime-source",
    "RELEASE_COMPOSITION_ROOT_SOURCE_MISMATCH",
  );
  assert.equal(
    base.image,
    "runtime-source",
    "RELEASE_COMPOSITION_BUILD_ABI_MISMATCH",
  );
  assert.equal(build.image, "base", "RELEASE_COMPOSITION_BUILD_ABI_MISMATCH");
  assert.ok(
    stages.indexOf(source) < stages.indexOf(root) &&
      stages.indexOf(source) < stages.indexOf(base) &&
      stages.indexOf(base) < stages.indexOf(build) &&
      stages.indexOf(root) < stages.indexOf(production),
    "RELEASE_COMPOSITION_STAGE_ORDER_INVALID",
  );
  assert.equal(
    production.name,
    "production",
    "RELEASE_FINAL_STAGE_NOT_PRODUCTION",
  );
  assert.equal(
    production.image,
    "scratch",
    "RELEASE_COMPOSITION_FINAL_BASE_INVALID",
  );

  assert.equal(
    source.instructions.length,
    1,
    "RELEASE_COMPOSITION_SOURCE_MUTATION",
  );
  assert.equal(
    source.instructions[0].name,
    "RUN",
    "RELEASE_COMPOSITION_INSTALL_MISSING",
  );
  const install = source.instructions[0].body.split(/[ \t]+/u);
  assert.deepEqual(
    install.slice(0, 3),
    ["apk", "add", "--no-cache"],
    "RELEASE_COMPOSITION_INSTALL_INVALID",
  );
  const packages = new Map();
  for (const token of install.slice(3)) {
    const pin = /^([a-z][a-z0-9+_.-]*)=([A-Za-z0-9][A-Za-z0-9+_.:-]*)$/u.exec(
      token,
    );
    assert.ok(pin, "RELEASE_COMPOSITION_PACKAGE_PIN_REQUIRED");
    assert.equal(
      packages.has(pin[1]),
      false,
      "RELEASE_COMPOSITION_PACKAGE_DUPLICATE",
    );
    packages.set(pin[1], pin[2]);
  }
  assert.equal(
    packages.get("nodejs"),
    "22.23.4-r0",
    "RELEASE_COMPOSITION_NODE_VERSION_MISMATCH",
  );
  assert.equal(
    packages.get("zlib"),
    "1.3.2-r1",
    "RELEASE_COMPOSITION_ZLIB_VERSION_MISMATCH",
  );
  requireInstructions(
    root.instructions,
    [
      ["COPY", `${compositionHelper} /runtime-image-composition.mjs`],
      [
        "RUN",
        ["node", "/runtime-image-composition.mjs", "compose", "/runtime-root"],
      ],
    ],
    "RELEASE_COMPOSITION_PRODUCER_ROUTE_INVALID",
  );
  requireInstructions(
    production.instructions,
    [
      ["COPY", "--from=runtime-root /runtime-root /"],
      ["WORKDIR", "/app"],
      ["ARG", "MORRO_RELEASE_SHA=unknown"],
      ["ARG", "MORRO_RELEASE_VERSION=unknown"],
      ["ARG", "MORRO_RELEASE_IMAGE_RUN_ID=unknown"],
      [
        "ENV",
        "NODE_ENV=production MORRO_RELEASE_SHA=$MORRO_RELEASE_SHA MORRO_RELEASE_VERSION=$MORRO_RELEASE_VERSION MORRO_RELEASE_IMAGE_RUN_ID=$MORRO_RELEASE_IMAGE_RUN_ID",
      ],
      ["COPY", "--from=build --chown=65532:65532 /app /app"],
      ["USER", "65532:65532"],
      ["RUN", [runtimeNode, `/app/${compositionHelper}`, "verify"]],
      ["EXPOSE", "3000"],
      ["ENTRYPOINT", [runtimeNode]],
      ["CMD", [expectedScript]],
    ],
    "RELEASE_COMPOSITION_FINAL_CONTRACT_INVALID",
  );
  return Object.freeze({
    runtime: "scratch",
    entrypoint: [expectedScript],
    nonrootUser: "65532:65532",
    composition: "alpine-3.22-pinned-node22",
  });
}

export function validateReleaseContainerEntrypoint(dockerfile) {
  assert.equal(typeof dockerfile, "string", "RELEASE_DOCKERFILE_INVALID");
  const stages = [...dockerfile.matchAll(/^FROM\s+(\S+)\s+AS\s+(\S+)\s*$/gmu)];
  assert.ok(stages.length >= 2, "RELEASE_STAGES_MISSING");
  const production = stages.at(-1);
  assert.equal(
    production[2],
    "production",
    "RELEASE_FINAL_STAGE_NOT_PRODUCTION",
  );
  assert.equal(
    stages.filter((stage) => stage[2] === "production").length,
    1,
    "RELEASE_PRODUCTION_STAGE_DUPLICATE",
  );
  if (production[1] === "scratch") return validateComposedRuntime(dockerfile);
  const selected = runtimes[production[1]];
  assert.ok(selected, "RELEASE_BASE_IMAGE_UNTRUSTED");
  const lastStage = dockerfile.slice(production.index + production[0].length);
  const directives = [
    ...lastStage.matchAll(/^\s*(CMD|ENTRYPOINT|USER|RUN)\s+(.+)$/gmu),
  ];
  const commands = directives.filter((entry) => entry[1] === "CMD");
  assert.equal(commands.length, 1, "RELEASE_CMD_NOT_UNIQUE");
  assert.equal(
    directives.some((entry) => entry[1] === "ENTRYPOINT"),
    false,
    "RELEASE_ENTRYPOINT_OVERRIDE_FORBIDDEN",
  );
  const users = directives.filter((entry) => entry[1] === "USER");
  assert.equal(users.length, 1, "RELEASE_USER_NOT_UNIQUE");
  assert.equal(
    users[0][2].trim(),
    selected.user,
    "RELEASE_NONROOT_USER_MISMATCH",
  );
  let command;
  try {
    command = JSON.parse(commands[0][2]);
  } catch {
    assert.fail("RELEASE_CMD_JSON_INVALID");
  }
  assert.deepEqual(
    command,
    selected.command,
    "RELEASE_RUNTIME_COMMAND_MISMATCH",
  );
  if (production[1].startsWith("gcr.io/distroless/")) {
    assert.equal(
      directives.some((entry) => entry[1] === "RUN"),
      false,
      "RELEASE_DISTROLESS_RUN_FORBIDDEN",
    );
    assert.match(
      lastStage,
      /^COPY --from=build --chown=65532:65532 \/app \/app$/mu,
      "RELEASE_DISTROLESS_COPY_MISSING",
    );
  }
  assert.match(
    lastStage,
    /MORRO_RELEASE_SHA=\$MORRO_RELEASE_SHA/u,
    "RELEASE_SHA_IDENTITY_MISSING",
  );
  assert.match(
    lastStage,
    /NODE_ENV=production/u,
    "RELEASE_NODE_PRODUCTION_MISSING",
  );
  return Object.freeze({
    runtime: production[1],
    entrypoint: [...command],
    nonrootUser: selected.user,
  });
}
