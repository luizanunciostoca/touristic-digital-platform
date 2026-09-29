import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertDeployImageIdentity,
  buildDatabaseUrl,
  cutover,
  productionDatabaseDomains,
  rollback,
  selectRegistryCredential,
} from "./production-canonical-db-cutover.mjs";

test("builds only the trusted private production MySQL URL", () => {
  const url = new URL(
    buildDatabaseUrl({
      host: "morro-digital-v2-production-mysql",
      port: 3306,
      database: "morro_business",
      user: "morro_business_runtime",
      password: "a+/= safe password",
    }),
  );
  assert.equal(url.hostname, "morro-digital-v2-production-mysql");
  assert.equal(url.port, "3306");
  assert.equal(url.username, "morro_business_runtime");
  assert.equal(url.pathname, "/morro_business");
  assert.equal(decodeURIComponent(url.password), "a+/= safe password");

  assert.throws(
    () =>
      buildDatabaseUrl({
        host: "legacy.example",
        port: 3306,
        database: "morro_business",
        user: "morro_business_runtime",
        password: "secret",
      }),
    /PRODUCTION_MYSQL_PRIVATE_ENDPOINT_UNTRUSTED/u,
  );
});

test("registry credential selection is deterministic and ambiguity fails closed", () => {
  assert.equal(selectRegistryCredential([], ""), "");
  assert.equal(
    selectRegistryCredential([{ id: "reg-one", registry: "GITHUB" }], ""),
    "reg-one",
  );
  assert.throws(
    () =>
      selectRegistryCredential(
        [
          { id: "reg-one", registry: "GITHUB" },
          { id: "reg-two", registry: "GITHUB" },
        ],
        "",
      ),
    /AMBIGUOUS/u,
  );
  assert.equal(
    selectRegistryCredential(
      [
        { id: "reg-one", registry: "GITHUB" },
        { id: "reg-two", registry: "GITHUB" },
      ],
      "reg-two",
    ),
    "reg-two",
  );
});

test("deploy digest identity accepts either authoritative field and rejects contradictions", () => {
  const digest = `sha256:${"b".repeat(64)}`;
  const imagePath = `ghcr.io/luizanunciostoca/morro-digital-v2@${digest}`;

  assert.doesNotThrow(() =>
    assertDeployImageIdentity({ image: { ref: imagePath } }, imagePath, digest),
  );
  assert.doesNotThrow(() =>
    assertDeployImageIdentity({ image: { sha: digest } }, imagePath, digest),
  );
  assert.throws(
    () =>
      assertDeployImageIdentity(
        { image: { ref: imagePath, sha: `sha256:${"c".repeat(64)}` } },
        imagePath,
        digest,
      ),
    /PRODUCTION_DEPLOY_DIGEST_MISMATCH/u,
  );
  assert.throws(
    () => assertDeployImageIdentity({ image: {} }, imagePath, digest),
    /PRODUCTION_DEPLOY_DIGEST_MISMATCH/u,
  );
});

function jsonResponse(status, payload) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() {
      return payload;
    },
  };
}

test("cutover wires thirteen server-only URLs, locks payments to TEST, and deploys the exact digest", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "morro-cutover-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const stateFile = path.join(directory, "state.json");
  const evidenceFile = path.join(directory, "evidence.json");
  const requests = [];
  const mysqlValues = {};
  for (const [domain, , schema] of productionDatabaseDomains) {
    mysqlValues[`${domain}_DATABASE_NAME`] = schema;
    mysqlValues[`${domain}_RUNTIME_DATABASE_USER`] = `${schema}_runtime`;
    mysqlValues[`${domain}_RUNTIME_DATABASE_PASSWORD`] =
      `${domain.toLowerCase()}-runtime-secret`;
  }

  const imageDigest = `sha256:${"b".repeat(64)}`;
  const imagePath = "ghcr.io/luizanunciostoca/morro-digital-v2@" + imageDigest;

  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    const route = parsed.pathname + parsed.search;
    const method = options.method ?? "GET";
    requests.push({ method, route, body: options.body ?? null });

    if (method === "GET" && route === "/v1/services/srv-web") {
      return jsonResponse(200, {
        id: "srv-web",
        ownerId: "tea-owner",
        name: "morro-digital-v2",
        type: "web_service",
        autoDeployTrigger: "off",
        repo: "https://github.com/luizanunciostoca/touristic-digital-platform",
        branch: "main",
        serviceDetails: {
          runtime: "node",
          region: "virginia",
          healthCheckPath: "",
          maxShutdownDelaySeconds: 30,
          envSpecificDetails: {
            buildCommand: "pnpm build",
            startCommand: "node app.mjs",
          },
        },
      });
    }

    if (method === "GET" && route === "/v1/services/srv-mysql") {
      return jsonResponse(200, {
        id: "srv-mysql",
        ownerId: "tea-owner",
        name: "morro-digital-v2-production-mysql",
        type: "private_service",
        serviceDetails: { region: "virginia", runtime: "docker" },
      });
    }

    if (method === "GET" && route === "/v1/services/srv-web/deploys?limit=20") {
      return jsonResponse(200, [
        {
          deploy: {
            id: "dep-old",
            status: "live",
            commit: { id: "a".repeat(40) },
          },
        },
      ]);
    }

    if (
      method === "GET" &&
      route === "/v1/services/srv-mysql/deploys?limit=20"
    ) {
      return jsonResponse(200, [
        {
          deploy: {
            id: "dep-mysql",
            status: "live",
            commit: { id: "d".repeat(40) },
          },
        },
      ]);
    }

    if (
      method === "GET" &&
      route ===
        "/v1/registrycredentials?ownerId=tea-owner&type=GITHUB&limit=100"
    ) {
      return jsonResponse(200, [{ id: "reg-ghcr", registry: "GITHUB" }]);
    }

    if (
      method === "GET" &&
      parsed.pathname.startsWith("/v1/services/srv-web/env-vars/")
    ) {
      return jsonResponse(404, {});
    }

    if (
      method === "GET" &&
      parsed.pathname.startsWith("/v1/services/srv-mysql/env-vars/")
    ) {
      const key = decodeURIComponent(parsed.pathname.split("/").at(-1));
      return jsonResponse(200, { envVar: { key, value: mysqlValues[key] } });
    }

    if (
      method === "PUT" &&
      parsed.pathname.startsWith("/v1/services/srv-web/env-vars/")
    ) {
      const key = decodeURIComponent(parsed.pathname.split("/").at(-1));
      const body = JSON.parse(options.body);
      return jsonResponse(200, { key, value: body.value });
    }

    if (method === "PATCH" && route === "/v1/services/srv-web") {
      const body = JSON.parse(options.body);
      assert.equal(body.autoDeployTrigger, "off");
      assert.equal(body.image.imagePath, imagePath);
      assert.equal(body.image.registryCredentialId, "reg-ghcr");
      assert.equal(body.serviceDetails.runtime, "image");
      assert.equal(body.serviceDetails.healthCheckPath, "/readyz");
      assert.match(
        body.serviceDetails.preDeployCommand,
        /production-runtime-database-predeploy\.mjs && node .*payments-migrate\.mjs/u,
      );
      return jsonResponse(200, { id: "srv-web" });
    }

    if (method === "POST" && route === "/v1/services/srv-web/deploys") {
      const body = JSON.parse(options.body);
      assert.equal(body.imageUrl, imagePath);
      return jsonResponse(201, { id: "dep-new" });
    }

    if (method === "GET" && route === "/v1/services/srv-web/deploys/dep-new") {
      return jsonResponse(200, {
        id: "dep-new",
        status: "live",
        image: { ref: imagePath, sha: imageDigest },
      });
    }

    throw new Error(`unexpected request ${method} ${route}`);
  };

  const result = await cutover({
    environment: {
      RENDER_PRODUCTION_API_KEY: "test-token",
      RENDER_WORKSPACE_ID: "tea-owner",
      RENDER_PRODUCTION_SERVICE_ID: "srv-web",
      RENDER_PRODUCTION_MYSQL_SERVICE_ID: "srv-mysql",
      EXPECTED_SHA: "c".repeat(40),
      IMAGE_DIGEST: imageDigest,
      IMAGE_REPOSITORY: "ghcr.io/luizanunciostoca/morro-digital-v2",
      EXPECTED_MYSQL_SOURCE_SHA: "d".repeat(40),
      CUTOVER_STATE_FILE: stateFile,
      CUTOVER_EVIDENCE_FILE: evidenceFile,
    },
    fetchImpl,
  });

  assert.equal(result.status, "live");
  assert.equal(result.databaseDomains, 13);
  assert.equal(result.paymentsMode, "test");
  assert.equal(result.subscriptionsEnabled, false);
  assert.equal(result.railwayRetirement, "KEEP_TEMPORARILY");

  const envWrites = requests.filter(
    (request) =>
      request.method === "PUT" &&
      request.route.startsWith("/v1/services/srv-web/env-vars/"),
  );
  const keys = envWrites.map((request) =>
    decodeURIComponent(request.route.split("/").at(-1)),
  );
  for (const [, canonicalKey] of productionDatabaseDomains) {
    assert.ok(keys.includes(canonicalKey), canonicalKey);
  }
  assert.ok(keys.includes("MORRO_DATABASE_SCHEMA_MODE"));
  assert.ok(
    !keys.some(
      (key) => key.startsWith("VITE_") && key.endsWith("_DATABASE_URL"),
    ),
  );

  const evidence = JSON.parse(await fs.readFile(evidenceFile, "utf8"));
  assert.equal(evidence.newDeployId, "dep-new");
  assert.ok(!JSON.stringify(evidence).includes("-secret"));
});

function failureCutoverFixture({
  directory,
  failPutKey = null,
  failSourcePatch = false,
  deployStatus = "build_failed",
}) {
  const stateFile = path.join(directory, "state.json");
  const evidenceFile = path.join(directory, "evidence.json");
  const requests = [];
  const previousReleaseSha = "a".repeat(40);
  const mysqlSourceSha = "d".repeat(40);
  const imageDigest = `sha256:${"b".repeat(64)}`;
  const imagePath = `ghcr.io/luizanunciostoca/morro-digital-v2@${imageDigest}`;
  const mysqlValues = {};
  for (const [domain, , schema] of productionDatabaseDomains) {
    mysqlValues[`${domain}_DATABASE_NAME`] = schema;
    mysqlValues[`${domain}_RUNTIME_DATABASE_USER`] = `${schema}_runtime`;
    mysqlValues[`${domain}_RUNTIME_DATABASE_PASSWORD`] =
      `${domain.toLowerCase()}-runtime-secret`;
  }

  const originalService = {
    id: "srv-web",
    ownerId: "tea-owner",
    name: "morro-digital-v2",
    type: "web_service",
    autoDeployTrigger: "off",
    repo: "https://github.com/luizanunciostoca/touristic-digital-platform",
    branch: "main",
    serviceDetails: {
      runtime: "node",
      region: "virginia",
      healthCheckPath: "",
      maxShutdownDelaySeconds: 30,
      envSpecificDetails: {
        buildCommand: "pnpm build",
        startCommand: "node app.mjs",
      },
    },
  };

  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    const route = parsed.pathname + parsed.search;
    const method = options.method ?? "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ method, route, body });

    if (method === "GET" && route === "/v1/services/srv-web") {
      return jsonResponse(200, originalService);
    }
    if (method === "GET" && route === "/v1/services/srv-mysql") {
      return jsonResponse(200, {
        id: "srv-mysql",
        ownerId: "tea-owner",
        name: "morro-digital-v2-production-mysql",
        type: "private_service",
        serviceDetails: { region: "virginia", runtime: "docker" },
      });
    }
    if (method === "GET" && route === "/v1/services/srv-web/deploys?limit=20") {
      return jsonResponse(200, [
        {
          deploy: {
            id: "dep-old",
            status: "live",
            commit: { id: previousReleaseSha },
          },
        },
      ]);
    }
    if (
      method === "GET" &&
      route === "/v1/services/srv-mysql/deploys?limit=20"
    ) {
      return jsonResponse(200, [
        {
          deploy: {
            id: "dep-mysql",
            status: "live",
            commit: { id: mysqlSourceSha },
          },
        },
      ]);
    }
    if (
      method === "GET" &&
      route ===
        "/v1/registrycredentials?ownerId=tea-owner&type=GITHUB&limit=100"
    ) {
      return jsonResponse(200, [{ id: "reg-ghcr", registry: "GITHUB" }]);
    }
    if (
      method === "GET" &&
      parsed.pathname.startsWith("/v1/services/srv-web/env-vars/")
    ) {
      return jsonResponse(404, {});
    }
    if (
      method === "GET" &&
      parsed.pathname.startsWith("/v1/services/srv-mysql/env-vars/")
    ) {
      const key = decodeURIComponent(parsed.pathname.split("/").at(-1));
      return jsonResponse(200, { envVar: { key, value: mysqlValues[key] } });
    }
    if (
      method === "PUT" &&
      parsed.pathname.startsWith("/v1/services/srv-web/env-vars/")
    ) {
      const key = decodeURIComponent(parsed.pathname.split("/").at(-1));
      if (key === failPutKey) return jsonResponse(500, { error: "injected" });
      return jsonResponse(200, { key, value: body.value });
    }
    if (
      method === "DELETE" &&
      parsed.pathname.startsWith("/v1/services/srv-web/env-vars/")
    ) {
      return jsonResponse(204, null);
    }
    if (method === "PATCH" && route === "/v1/services/srv-web") {
      if (body?.image && failSourcePatch) {
        return jsonResponse(500, { error: "injected-source-patch-failure" });
      }
      return jsonResponse(200, { id: "srv-web" });
    }
    if (method === "POST" && route === "/v1/services/srv-web/deploys") {
      return jsonResponse(201, { id: "dep-new" });
    }
    if (method === "GET" && route === "/v1/services/srv-web/deploys/dep-new") {
      return jsonResponse(200, {
        id: "dep-new",
        status: deployStatus,
        image:
          deployStatus === "live"
            ? { ref: imagePath, sha: imageDigest }
            : undefined,
      });
    }
    if (method === "POST" && route === "/v1/services/srv-web/rollback") {
      assert.equal(body.deployId, "dep-old");
      return jsonResponse(201, { id: "dep-rollback" });
    }
    if (
      method === "GET" &&
      route === "/v1/services/srv-web/deploys/dep-rollback"
    ) {
      return jsonResponse(200, {
        id: "dep-rollback",
        status: "live",
        commit: { id: previousReleaseSha },
      });
    }
    throw new Error(`unexpected request ${method} ${route}`);
  };

  return {
    stateFile,
    evidenceFile,
    requests,
    fetchImpl,
    imageDigest,
    imagePath,
    previousReleaseSha,
    environment: {
      RENDER_PRODUCTION_API_KEY: "test-token",
      RENDER_WORKSPACE_ID: "tea-owner",
      RENDER_PRODUCTION_SERVICE_ID: "srv-web",
      RENDER_PRODUCTION_MYSQL_SERVICE_ID: "srv-mysql",
      EXPECTED_SHA: "c".repeat(40),
      IMAGE_DIGEST: imageDigest,
      IMAGE_REPOSITORY: "ghcr.io/luizanunciostoca/morro-digital-v2",
      EXPECTED_MYSQL_SOURCE_SHA: mysqlSourceSha,
      CUTOVER_STATE_FILE: stateFile,
      CUTOVER_EVIDENCE_FILE: evidenceFile,
    },
  };
}

test("source patch failure after env mutation restores every previous env value without rollback deployment", async (t) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "morro-cutover-source-patch-failure-"),
  );
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const fixture = failureCutoverFixture({
    directory,
    failSourcePatch: true,
    deployStatus: "live",
  });

  await assert.rejects(
    cutover({
      environment: fixture.environment,
      fetchImpl: fixture.fetchImpl,
    }),
    /RENDER_API_PATCH_HTTP_500/u,
  );

  const envWrites = fixture.requests.filter(
    (request) =>
      request.method === "PUT" &&
      request.route.startsWith("/v1/services/srv-web/env-vars/"),
  );
  const envDeletes = fixture.requests.filter(
    (request) =>
      request.method === "DELETE" &&
      request.route.startsWith("/v1/services/srv-web/env-vars/"),
  );
  assert.ok(envWrites.length >= productionDatabaseDomains.length);
  assert.equal(envDeletes.length, envWrites.length);
  assert.equal(
    fixture.requests.filter(
      (request) =>
        request.method === "POST" &&
        request.route === "/v1/services/srv-web/rollback",
    ).length,
    0,
  );

  const state = JSON.parse(await fs.readFile(fixture.stateFile, "utf8"));
  const evidence = JSON.parse(await fs.readFile(fixture.evidenceFile, "utf8"));
  assert.equal(state.status, "restored_pre_patch");
  assert.equal(evidence.status, "restored_pre_patch");
  assert.ok(!JSON.stringify(evidence).includes("runtime-secret"));
});

test("post-patch failure automatically restores source and env then waits for rollback", async (t) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "morro-cutover-rollback-"),
  );
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const fixture = failureCutoverFixture({ directory });

  await assert.rejects(
    cutover({
      environment: fixture.environment,
      fetchImpl: fixture.fetchImpl,
    }),
    /RENDER_DEPLOY_BUILD_FAILED/u,
  );

  assert.ok(
    fixture.requests.some(
      (request) =>
        request.method === "POST" &&
        request.route === "/v1/services/srv-web/rollback",
    ),
  );
  assert.ok(
    fixture.requests.some(
      (request) =>
        request.method === "GET" &&
        request.route === "/v1/services/srv-web/deploys/dep-rollback",
    ),
  );
  const evidence = JSON.parse(await fs.readFile(fixture.evidenceFile, "utf8"));
  assert.equal(evidence.status, "rolled_back");
  assert.equal(evidence.rollbackDeployId, "dep-rollback");
  assert.equal(evidence.previousReleaseSha, fixture.previousReleaseSha);
  assert.ok(!JSON.stringify(evidence).includes("runtime-secret"));
});

test("pre-patch env failure restores the snapshot without changing service source", async (t) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "morro-cutover-prepatch-"),
  );
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const fixture = failureCutoverFixture({
    directory,
    failPutKey: "AUTH_DATABASE_URL",
  });

  await assert.rejects(
    cutover({
      environment: fixture.environment,
      fetchImpl: fixture.fetchImpl,
    }),
    /RENDER_API_PUT_HTTP_500/u,
  );

  assert.equal(
    fixture.requests.filter((request) => request.method === "PATCH").length,
    0,
  );
  assert.equal(
    fixture.requests.filter(
      (request) =>
        request.method === "POST" &&
        request.route === "/v1/services/srv-web/rollback",
    ).length,
    0,
  );
  assert.ok(
    fixture.requests.some(
      (request) =>
        request.method === "DELETE" &&
        request.route.includes("/env-vars/AUTH_DATABASE_URL"),
    ),
  );
  const evidence = JSON.parse(await fs.readFile(fixture.evidenceFile, "utf8"));
  assert.equal(evidence.status, "restored_pre_patch");
  assert.equal(evidence.rollbackDeployId, null);
  assert.ok(!JSON.stringify(evidence).includes("runtime-secret"));
});

test("a post-deploy verification failure can roll back a live new deploy using the retained state", async (t) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "morro-cutover-post-smoke-"),
  );
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const fixture = failureCutoverFixture({
    directory,
    deployStatus: "live",
  });

  const deployed = await cutover({
    environment: fixture.environment,
    fetchImpl: fixture.fetchImpl,
  });
  assert.equal(deployed.status, "live");

  const rolledBack = await rollback({
    environment: fixture.environment,
    fetchImpl: fixture.fetchImpl,
  });
  assert.equal(rolledBack.status, "rolled_back");
  assert.equal(rolledBack.rollbackDeployId, "dep-rollback");
  assert.ok(
    fixture.requests.some(
      (request) =>
        request.method === "GET" &&
        request.route === "/v1/services/srv-web/deploys/dep-rollback",
    ),
  );
  assert.ok(!JSON.stringify(rolledBack).includes("runtime-secret"));
});

test("explicit rollback waits for the previous release before reporting success", async (t) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "morro-cutover-explicit-rollback-"),
  );
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const fixture = failureCutoverFixture({ directory });
  const state = {
    contract: "MORRO-CANONICAL-PRODUCTION-DATABASE-CUTOVER-STATE",
    status: "live",
    expectedSha: fixture.environment.EXPECTED_SHA,
    imageDigest: fixture.imageDigest,
    imageRepository: fixture.environment.IMAGE_REPOSITORY,
    expectedMysqlSourceSha: fixture.environment.EXPECTED_MYSQL_SOURCE_SHA,
    webServiceId: "srv-web",
    mysqlServiceId: "srv-mysql",
    previousDeployId: "dep-old",
    previousReleaseSha: fixture.previousReleaseSha,
    previousSource: {
      repo: "https://github.com/luizanunciostoca/touristic-digital-platform",
      branch: "main",
      runtime: "node",
      buildCommand: "pnpm build",
      startCommand: "node app.mjs",
      preDeployCommand: "",
      healthCheckPath: "",
      maxShutdownDelaySeconds: 30,
      previousReleaseSha: fixture.previousReleaseSha,
    },
    previousEnv: {},
    newDeployId: "dep-new",
  };
  await fs.writeFile(fixture.stateFile, JSON.stringify(state), { mode: 0o600 });

  const result = await rollback({
    environment: fixture.environment,
    fetchImpl: fixture.fetchImpl,
  });
  assert.equal(result.status, "rolled_back");
  assert.equal(result.rollbackDeployId, "dep-rollback");
  assert.ok(!JSON.stringify(result).includes("runtime-secret"));
});

