import fs from "node:fs/promises";

const API = "https://api.render.com/v1";
const WORKSPACE_ID = "tea-d9p09oks728c7381s990";
const MYSQL_SERVICE_ID = "srv-datbsavlot8c73evbhj0";
const MYSQL_SERVICE_NAME = "morro-digital-v2-production-mysql";
const APP_SERVICE_ID = "srv-daqgk83ncjis739tghig";
const APP_SERVICE_NAME = "morro-digital-v2";
const TARGET_URL = "https://morro-digital-v2.onrender.com";
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;

const DATABASES = Object.freeze([
  ["AUTH", "AUTH_DATABASE_URL", "morro_auth"],
  ["AUDIT", "CONTROL_CENTER_AUDIT_DATABASE_URL", "morro_audit"],
  ["DESTINATIONS", "DESTINATIONS_DATABASE_URL", "morro_destinations"],
  ["CONTENT", "CONTENT_DATABASE_URL", "morro_content"],
  ["BUSINESS", "BUSINESS_DATABASE_URL", "morro_business"],
  ["ORDERING", "ORDERING_DATABASE_URL", "morro_ordering"],
  ["FINANCIAL", "FINANCIAL_DATABASE_URL", "morro_financial"],
  ["TICKETING", "TICKETING_DATABASE_URL", "morro_ticketing"],
  ["NOTIFICATIONS", "NOTIFICATIONS_DATABASE_URL", "morro_notifications"],
  ["AFFILIATES", "AFFILIATES_DATABASE_URL", "morro_affiliates"],
  ["ANALYTICS", "ANALYTICS_DATABASE_URL", "morro_analytics"],
  ["CRM", "CRM_DATABASE_URL", "morro_crm"],
  ["COMMERCE", "COMMERCE_DATABASE_URL", "morro_commerce"],
]);

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(name + "_REQUIRED");
  return value;
}

function safeCode(error) {
  const message = error instanceof Error ? error.message : "";
  return /^[A-Z0-9_:-]{3,200}$/u.test(message)
    ? message
    : "PRODUCTION_CUTOVER_FAILED";
}

const token = required("RENDER_PRODUCTION_API_KEY");
const expectedSha = required("EXPECTED_SHA");
const imageDigest = required("IMAGE_DIGEST");
const imageRepository = required("IMAGE_REPOSITORY");
if (!SHA_PATTERN.test(expectedSha)) throw new Error("EXPECTED_SHA_INVALID");
if (!DIGEST_PATTERN.test(imageDigest)) throw new Error("IMAGE_DIGEST_INVALID");
if (!/^ghcr\.io\/[a-z0-9_.-]+\/[a-z0-9_.-]+$/u.test(imageRepository)) {
  throw new Error("IMAGE_REPOSITORY_INVALID");
}
const imageRef = imageRepository + "@" + imageDigest;

async function api(path, { method = "GET", body, allow404 = false } = {}) {
  const response = await fetch(API + path, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (allow404 && response.status === 404) return null;
  if (!response.ok) {
    throw new Error("RENDER_API_" + method + "_" + response.status);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function serviceRecord(value) {
  return value?.service ?? value;
}

function deployRecord(value) {
  return value?.deploy ?? value;
}

function envRecord(value) {
  return value?.envVar ?? value;
}

async function getEnv(serviceId, key) {
  const value = await api(
    "/services/" + serviceId + "/env-vars/" + encodeURIComponent(key),
    { allow404: true },
  );
  if (value == null) return null;
  const record = envRecord(value);
  const result = String(record?.value ?? "").trim();
  return result || null;
}

async function putEnv(serviceId, key, value) {
  await api(
    "/services/" + serviceId + "/env-vars/" + encodeURIComponent(key),
    { method: "PUT", body: { value } },
  );
}

async function listEnv(serviceId) {
  const response = await api("/services/" + serviceId + "/env-vars?limit=100");
  if (!Array.isArray(response)) throw new Error("RENDER_ENV_LIST_INVALID");
  if (response.length >= 100) throw new Error("RENDER_ENV_LIST_PAGINATION_REQUIRED");
  return response.map(envRecord).map((record) => ({
    key: String(record?.key ?? ""),
    value: String(record?.value ?? ""),
  }));
}

async function replaceEnv(serviceId, records) {
  await api("/services/" + serviceId + "/env-vars", {
    method: "PUT",
    body: records,
  });
}

async function latestLiveDeploy(serviceId) {
  const response = await api("/services/" + serviceId + "/deploys?limit=20");
  if (!Array.isArray(response)) throw new Error("RENDER_DEPLOY_LIST_INVALID");
  const live = response.map(deployRecord).find((deploy) => deploy?.status === "live");
  if (!live?.id) throw new Error("RENDER_LIVE_DEPLOY_REQUIRED");
  return live;
}

async function waitDeploy(serviceId, deployId, timeoutMs = 20 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let deploy;
    try {
      deploy = deployRecord(
        await api("/services/" + serviceId + "/deploys/" + deployId),
      );
    } catch (error) {
      if (safeCode(error) !== "RENDER_API_GET_404") throw error;
      await new Promise((resolve) => setTimeout(resolve, 4_000));
      continue;
    }
    const status = String(deploy?.status ?? "");
    if (status === "live") return deploy;
    if (
      ["build_failed", "update_failed", "pre_deploy_failed", "canceled"].includes(
        status,
      )
    ) {
      throw new Error("RENDER_DEPLOY_" + status.toUpperCase());
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error("RENDER_DEPLOY_TIMEOUT");
}

function validateServiceState(mysql, app) {
  const mysqlService = serviceRecord(mysql);
  const appService = serviceRecord(app);
  if (
    mysqlService?.id !== MYSQL_SERVICE_ID ||
    mysqlService?.name !== MYSQL_SERVICE_NAME ||
    mysqlService?.ownerId !== WORKSPACE_ID ||
    mysqlService?.type !== "private_service" ||
    mysqlService?.serviceDetails?.region !== "virginia" ||
    mysqlService?.serviceDetails?.disk?.mountPath !== "/var/lib/mysql"
  ) {
    throw new Error("PRODUCTION_MYSQL_IDENTITY_MISMATCH");
  }
  if (
    appService?.id !== APP_SERVICE_ID ||
    appService?.name !== APP_SERVICE_NAME ||
    appService?.ownerId !== WORKSPACE_ID ||
    appService?.type !== "web_service" ||
    appService?.serviceDetails?.region !== "virginia"
  ) {
    throw new Error("PRODUCTION_APP_IDENTITY_MISMATCH");
  }
  if (!["no", false].includes(appService.autoDeploy)) {
    throw new Error("PRODUCTION_APP_AUTODEPLOY_MUST_BE_OFF");
  }
}

function databaseUrl(user, password, database) {
  const url = new URL("mysql://placeholder.invalid/");
  url.hostname = MYSQL_SERVICE_NAME;
  url.port = "3306";
  url.username = user;
  url.password = password;
  url.pathname = "/" + database;
  return url.toString();
}

function currentSourcePatch(app) {
  const record = serviceRecord(app);
  const details = record?.serviceDetails ?? {};
  const envDetails = details?.envSpecificDetails ?? {};
  return {
    autoDeploy: record?.autoDeploy === true || record?.autoDeploy === "yes" ? "yes" : "no",
    repo: record?.repo ?? null,
    branch: record?.branch ?? null,
    image: record?.imagePath
      ? { imagePath: record.imagePath, ownerId: WORKSPACE_ID }
      : null,
    serviceDetails: {
      runtime: details.runtime ?? details.env ?? "node",
      healthCheckPath: details.healthCheckPath ?? "",
      preDeployCommand: details.preDeployCommand ?? "",
      maxShutdownDelaySeconds: details.maxShutdownDelaySeconds ?? 30,
      envSpecificDetails: {
        ...(envDetails.buildCommand ? { buildCommand: envDetails.buildCommand } : {}),
        ...(envDetails.startCommand ? { startCommand: envDetails.startCommand } : {}),
      },
    },
  };
}

async function rollback({ previousEnv, previousServicePatch, previousDeployId }) {
  const errors = [];
  try {
    await replaceEnv(APP_SERVICE_ID, previousEnv);
  } catch {
    errors.push("ENV");
  }
  try {
    await api("/services/" + APP_SERVICE_ID, {
      method: "PATCH",
      body: previousServicePatch,
    });
  } catch {
    errors.push("SERVICE");
  }
  try {
    await api("/services/" + APP_SERVICE_ID + "/rollback", {
      method: "POST",
      body: { deployId: previousDeployId },
    });
  } catch {
    errors.push("DEPLOY");
  }
  if (errors.length) {
    throw new Error("PRODUCTION_ROLLBACK_INCOMPLETE_" + errors.join("_"));
  }
}

async function readiness() {
  let last = "";
  for (let index = 0; index < 90; index += 1) {
    try {
      const response = await fetch(TARGET_URL + "/readyz", {
        headers: { Accept: "application/json" },
      });
      last = await response.text();
      if (response.ok) {
        let json;
        try {
          json = JSON.parse(last);
        } catch {
          json = null;
        }
        if (json && JSON.stringify(json).includes(expectedSha)) {
          return { status: response.status, body: json };
        }
        if (json?.status === "ready" || json?.status === "healthy") {
          return { status: response.status, body: json };
        }
      }
    } catch {
      // Retry boundedly while Render is swapping instances.
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error("PRODUCTION_READINESS_TIMEOUT");
}

let mutationStarted = false;
let previousEnv = [];
let previousServicePatch;
let previousDeployId = "";
let newDeployId = "";

try {
  const [mysql, app] = await Promise.all([
    api("/services/" + MYSQL_SERVICE_ID),
    api("/services/" + APP_SERVICE_ID),
  ]);
  validateServiceState(mysql, app);

  const [mysqlLive, appLive, appEnv] = await Promise.all([
    latestLiveDeploy(MYSQL_SERVICE_ID),
    latestLiveDeploy(APP_SERVICE_ID),
    listEnv(APP_SERVICE_ID),
  ]);
  const mysqlSourceSha = String(mysqlLive?.commit?.id ?? "");
  if (!SHA_PATTERN.test(mysqlSourceSha)) {
    throw new Error("PRODUCTION_MYSQL_SOURCE_SHA_INVALID");
  }

  previousEnv = appEnv;
  previousServicePatch = currentSourcePatch(app);
  previousDeployId = String(appLive.id);

  const browserDatabaseKeys = appEnv
    .map(({ key }) => key)
    .filter((key) => /^VITE_.*DATABASE/u.test(key));
  if (browserDatabaseKeys.length) {
    throw new Error("DATABASE_SECRET_BROWSER_EXPOSURE_DETECTED");
  }

  mutationStarted = true;

  for (const [domain, runtimeKey, expectedDatabase] of DATABASES) {
    const [name, user, password] = await Promise.all([
      getEnv(MYSQL_SERVICE_ID, domain + "_DATABASE_NAME"),
      getEnv(MYSQL_SERVICE_ID, domain + "_DATABASE_USER"),
      getEnv(MYSQL_SERVICE_ID, domain + "_DATABASE_PASSWORD"),
    ]);
    if (
      name !== expectedDatabase ||
      user !== expectedDatabase ||
      typeof password !== "string" ||
      password.length < 16
    ) {
      throw new Error("PRODUCTION_DB_OWNER_INVALID_" + domain);
    }
    await putEnv(
      APP_SERVICE_ID,
      runtimeKey,
      databaseUrl(user, password, expectedDatabase),
    );
  }

  await Promise.all([
    putEnv(APP_SERVICE_ID, "MERCADO_PAGO_CHECKOUT_MODE", "test"),
    putEnv(APP_SERVICE_ID, "MERCADO_PAGO_PRODUCTION_CREDENTIALS_CONFIRMED", "false"),
    putEnv(APP_SERVICE_ID, "PAYMENTS_SUBSCRIPTIONS_ENABLED", "false"),
  ]);

  const postEnv = await listEnv(APP_SERVICE_ID);
  if (postEnv.some(({ key }) => /^VITE_.*DATABASE/u.test(key))) {
    throw new Error("DATABASE_SECRET_BROWSER_EXPOSURE_DETECTED");
  }
  for (const [, runtimeKey] of DATABASES) {
    const value = postEnv.find(({ key }) => key === runtimeKey)?.value ?? "";
    const url = new URL(value);
    if (
      url.protocol !== "mysql:" ||
      url.hostname !== MYSQL_SERVICE_NAME ||
      url.port !== "3306" ||
      !url.password
    ) {
      throw new Error("PRODUCTION_RUNTIME_DATABASE_URL_INVALID");
    }
  }

  const preDeployCommand =
    'env EXPECTED_SHA="${MORRO_RELEASE_SHA:-$RENDER_GIT_COMMIT}" ' +
    "node apps/morro-digital-platform/tooling/production-database-predeploy.mjs " +
    "--verify-idempotent && " +
    "node apps/morro-digital-platform/tooling/payments-migrate.mjs";

  await api("/services/" + APP_SERVICE_ID, {
    method: "PATCH",
    body: {
      autoDeploy: "no",
      repo: null,
      branch: null,
      image: { imagePath: imageRef, ownerId: WORKSPACE_ID },
      serviceDetails: {
        runtime: "image",
        healthCheckPath: "/readyz",
        preDeployCommand,
        maxShutdownDelaySeconds: 30,
      },
    },
  });

  const patched = serviceRecord(await api("/services/" + APP_SERVICE_ID));
  if (
    patched?.serviceDetails?.runtime !== "image" ||
    patched?.serviceDetails?.healthCheckPath !== "/readyz" ||
    !String(patched?.imagePath ?? "").includes(imageDigest)
  ) {
    throw new Error("PRODUCTION_IMAGE_SERVICE_PATCH_NOT_APPLIED");
  }

  const deployResponse = deployRecord(
    await api("/services/" + APP_SERVICE_ID + "/deploys", {
      method: "POST",
      body: { imageUrl: imageRef, clearCache: "do_not_clear" },
    }),
  );
  newDeployId = String(deployResponse?.id ?? "");
  if (!newDeployId) throw new Error("PRODUCTION_DEPLOY_ID_MISSING");
  await waitDeploy(APP_SERVICE_ID, newDeployId);

  const ready = await readiness();

  const evidence = {
    contract: "MORRO-CANONICAL-PRODUCTION-DATABASE-CUTOVER",
    contractVersion: 1,
    status: "pass",
    expectedSha,
    image: imageRepository,
    imageDigest,
    render: {
      workspaceId: WORKSPACE_ID,
      mysqlServiceId: MYSQL_SERVICE_ID,
      mysqlSourceSha,
      appServiceId: APP_SERVICE_ID,
      previousDeployId,
      newDeployId,
      databaseHost: MYSQL_SERVICE_NAME,
      databasePort: 3306,
      canonicalDatabaseUrlCount: DATABASES.length,
      healthCheckPath: "/readyz",
    },
    paymentSafety: {
      checkoutMode: "test",
      productionCredentialsConfirmed: false,
      subscriptionsEnabled: false,
      realMoneySmokeAuthorized: false,
    },
    readiness: {
      httpStatus: ready.status,
      status: ready.body?.status ?? "http-healthy",
    },
    rollback: {
      previousDeployCaptured: true,
      railwayRetirementAuthorized: false,
    },
  };
  await fs.writeFile(
    "production-cutover-evidence.json",
    JSON.stringify(evidence, null, 2) + "\n",
    { mode: 0o600 },
  );
  process.stdout.write(JSON.stringify(evidence) + "\n");
} catch (error) {
  const reason = safeCode(error);
  if (mutationStarted && previousDeployId && previousServicePatch) {
    try {
      await rollback({ previousEnv, previousServicePatch, previousDeployId });
      process.stderr.write(
        JSON.stringify({
          contract: "MORRO-CANONICAL-PRODUCTION-DATABASE-CUTOVER",
          status: "rolled_back",
          reason,
          previousDeployId,
          failedDeployId: newDeployId || null,
        }) + "\n",
      );
    } catch (rollbackError) {
      process.stderr.write(
        JSON.stringify({
          contract: "MORRO-CANONICAL-PRODUCTION-DATABASE-CUTOVER",
          status: "rollback_failed",
          reason,
          rollbackReason: safeCode(rollbackError),
          previousDeployId,
          failedDeployId: newDeployId || null,
        }) + "\n",
      );
    }
  } else {
    process.stderr.write(
      JSON.stringify({
        contract: "MORRO-CANONICAL-PRODUCTION-DATABASE-CUTOVER",
        status: "fail_before_mutation",
        reason,
      }) + "\n",
    );
  }
  process.exitCode = 1;
}
