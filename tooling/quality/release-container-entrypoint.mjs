import assert from "node:assert/strict";

const expectedScript = "apps/morro-digital-platform/tooling/dev-server.mjs";
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
