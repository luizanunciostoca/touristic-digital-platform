import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const COMMERCE_DESTINATION_ID = "morro-de-sao-paulo";

export const productionDatabaseDomains = Object.freeze([
  Object.freeze(["AUTH", "AUTH_DATABASE_URL", "morro_auth"]),
  Object.freeze(["AUDIT", "CONTROL_CENTER_AUDIT_DATABASE_URL", "morro_audit"]),
  Object.freeze([
    "DESTINATIONS",
    "DESTINATIONS_DATABASE_URL",
    "morro_destinations",
  ]),
  Object.freeze(["CONTENT", "CONTENT_DATABASE_URL", "morro_content"]),
  Object.freeze(["BUSINESS", "BUSINESS_DATABASE_URL", "morro_business"]),
  Object.freeze(["ORDERING", "ORDERING_DATABASE_URL", "morro_ordering"]),
  Object.freeze(["FINANCIAL", "FINANCIAL_DATABASE_URL", "morro_financial"]),
  Object.freeze(["TICKETING", "TICKETING_DATABASE_URL", "morro_ticketing"]),
  Object.freeze([
    "NOTIFICATIONS",
    "NOTIFICATIONS_DATABASE_URL",
    "morro_notifications",
  ]),
  Object.freeze(["AFFILIATES", "AFFILIATES_DATABASE_URL", "morro_affiliates"]),
  Object.freeze(["ANALYTICS", "ANALYTICS_DATABASE_URL", "morro_analytics"]),
  Object.freeze(["CRM", "CRM_DATABASE_URL", "morro_crm"]),
  Object.freeze(["COMMERCE", "COMMERCE_DATABASE_URL", "morro_commerce"]),
]);

function required(environment, key) {
  const value = String(environment[key] ?? "").trim();
  if (!value) throw new Error(`${key}_REQUIRED`);
  return value;
}

function safeCode(error) {
  const message = error instanceof Error ? String(error.message) : "";
  return /^[A-Z][A-Z0-9_:-]{2,180}$/u.test(message)
    ? message
    : "PRODUCTION_CUTOVER_FAILED";
}

function normalizeDeploys(payload) {
  if (!Array.isArray(payload)) return [];
  return payload.map((entry) => entry?.deploy ?? entry).filter(Boolean);
}

function normalizeEnvVars(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.envVars)
      ? payload.envVars
      : [];
  return rows.map((entry) => entry?.envVar ?? entry).filter(Boolean);
}

function runtime(service) {
  return String(
    service?.serviceDetails?.runtime ?? service?.serviceDetails?.env ?? "",
  );
}

function nativeDetails(service) {
  return service?.serviceDetails?.envSpecificDetails ?? {};
}

export function selectRegistryCredential(credentials, explicitId = "") {
  const github = (Array.isArray(credentials) ? credentials : []).filter(
    (credential) => String(credential?.registry ?? "") === "GITHUB",
  );
  if (explicitId) {
    const match = github.find((credential) => credential.id === explicitId);
    if (!match) throw new Error("RENDER_GHCR_REGISTRY_CREDENTIAL_NOT_FOUND");
    return match.id;
  }
  if (github.length === 0) return "";
  if (github.length > 1) {
    throw new Error("RENDER_GHCR_REGISTRY_CREDENTIAL_AMBIGUOUS");
  }
  return github[0].id;
}

export function assertDeployImageIdentity(observed, imagePath, imageDigest) {
  const observedRef = String(observed?.image?.ref ?? "");
  const observedDigest = String(observed?.image?.sha ?? "");
  if (
    (!observedRef && !observedDigest) ||
    (observedRef && observedRef !== imagePath) ||
    (observedDigest && observedDigest !== imageDigest)
  ) {
    throw new Error("PRODUCTION_DEPLOY_DIGEST_MISMATCH");
  }
}

export function resolvePreviousReleaseSha(liveDeploy, previousEnv = {}) {
  const candidates = [
    String(liveDeploy?.commit?.id ?? "").trim(),
    String(previousEnv.MORRO_RELEASE_SHA ?? "").trim(),
    String(previousEnv.EXPECTED_SHA ?? "").trim(),
  ].filter(Boolean);

  if (
    candidates.length === 0 ||
    candidates.some((sha) => !SHA_PATTERN.test(sha))
  ) {
    throw new Error("PRODUCTION_PREVIOUS_SHA_INVALID");
  }
  if (new Set(candidates).size !== 1) {
    throw new Error("PRODUCTION_PREVIOUS_SHA_MISMATCH");
  }
  return candidates[0];
}

export function trustedPreviousImageIdentity(
  service,
  imageRepository = "ghcr.io/luizanunciostoca/morro-digital-v2",
) {
  const imagePath = String(service?.imagePath ?? "").trim();
  const prefix = `${imageRepository}@`;
  if (!imagePath.startsWith(prefix)) {
    throw new Error("PRODUCTION_PREVIOUS_IMAGE_UNTRUSTED");
  }
  const imageDigest = imagePath.slice(prefix.length);
  if (!DIGEST_PATTERN.test(imageDigest)) {
    throw new Error("PRODUCTION_PREVIOUS_IMAGE_DIGEST_INVALID");
  }
  return Object.freeze({ imagePath, imageDigest });
}

export function buildDatabaseUrl({ host, port, database, user, password }) {
  if (host !== "morro-digital-v2-production-mysql" || Number(port) !== 3306) {
    throw new Error("PRODUCTION_MYSQL_PRIVATE_ENDPOINT_UNTRUSTED");
  }
  if (!/^[A-Za-z0-9_]+$/u.test(database) || !/^[A-Za-z0-9_]+$/u.test(user)) {
    throw new Error("PRODUCTION_MYSQL_IDENTIFIER_INVALID");
  }
  if (!password) throw new Error("PRODUCTION_MYSQL_PASSWORD_REQUIRED");
  const url = new URL("mysql://placeholder.invalid/");
  url.hostname = host;
  url.port = String(port);
  url.username = user;
  url.password = password;
  url.pathname = `/${database}`;
  return url.toString();
}

function publicEvidence(state) {
  return {
    contract: "MORRO-CANONICAL-PRODUCTION-DATABASE-CUTOVER",
    contractVersion: 1,
    status: state.status,
    expectedSha: state.expectedSha,
    imageDigest: state.imageDigest,
    imageRepository: state.imageRepository,
    previousDeployId: state.previousDeployId,
    previousReleaseSha: state.previousReleaseSha,
    previousImageDigest: state.previousSource?.imageDigest ?? null,
    newDeployId: state.newDeployId ?? null,
    rollbackDeployId: state.rollbackDeployId ?? null,
    rollbackNotRequired: state.rollbackNotRequired === true,
    databaseDomains: productionDatabaseDomains.length,
    paymentsMode: "test",
    subscriptionsEnabled: false,
    commerceFeatureEnabled: true,
    commerceRuntimeCredentials: state.commerceRuntimeCredentials ?? null,
    railwayRetirement: "KEEP_TEMPORARILY",
  };
}

export function createClient({
  token,
  baseUrl = "https://api.render.com/v1",
  fetchImpl = fetch,
} = {}) {
  if (!token) throw new Error("RENDER_PRODUCTION_API_KEY_REQUIRED");
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };

  async function request(method, path, body, { allow404 = false } = {}) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers:
        body === undefined
          ? headers
          : { ...headers, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (allow404 && response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`RENDER_API_${method}_HTTP_${response.status}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  return Object.freeze({
    get: (path, options) => request("GET", path, undefined, options),
    put: (path, body) => request("PUT", path, body),
    patch: (path, body) => request("PATCH", path, body),
    post: (path, body) => request("POST", path, body),
    delete: (path) => request("DELETE", path),
  });
}

async function readEnv(client, serviceId, key) {
  const value = await client.get(
    `/services/${serviceId}/env-vars/${encodeURIComponent(key)}`,
    { allow404: true },
  );
  if (value == null) return null;
  const record = value?.envVar ?? value;
  return String(record?.value ?? "");
}

async function writeEnv(client, serviceId, key, value) {
  await client.put(
    `/services/${serviceId}/env-vars/${encodeURIComponent(key)}`,
    { value },
  );
}

async function deleteEnv(client, serviceId, key) {
  try {
    await client.delete(
      `/services/${serviceId}/env-vars/${encodeURIComponent(key)}`,
    );
  } catch (error) {
    if (safeCode(error) !== "RENDER_API_DELETE_HTTP_404") throw error;
  }
}

async function assertMysqlSourceStillProven(
  client,
  mysqlServiceId,
  expectedMysqlSourceSha,
) {
  const payload = await client.get(
    `/services/${mysqlServiceId}/deploys?limit=20`,
  );
  const liveDeploy = normalizeDeploys(payload).find(
    (deploy) => deploy.status === "live",
  );
  if (
    !liveDeploy?.id ||
    String(liveDeploy.commit?.id ?? "") !== expectedMysqlSourceSha
  ) {
    throw new Error("PRODUCTION_MYSQL_DR_SOURCE_STALE");
  }
  return liveDeploy;
}

async function waitForDeploy(client, serviceId, deployId, attempts = 180) {
  for (let index = 0; index < attempts; index += 1) {
    const deploy = await client.get(
      `/services/${serviceId}/deploys/${deployId}`,
    );
    const status = String(deploy?.status ?? "");
    if (status === "live") return deploy;
    if (
      [
        "build_failed",
        "update_failed",
        "pre_deploy_failed",
        "canceled",
      ].includes(status)
    ) {
      throw new Error(`RENDER_DEPLOY_${status.toUpperCase()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error("RENDER_DEPLOY_TIMEOUT");
}

async function snapshotRuntimeEnv(client, webServiceId) {
  const previous = {};
  for (const [, canonicalKey] of productionDatabaseDomains) {
    previous[canonicalKey] = await readEnv(client, webServiceId, canonicalKey);
  }
  for (const key of [
    "EXPECTED_SHA",
    "MORRO_RELEASE_SHA",
    "MORRO_DATABASE_SCHEMA_MODE",
    "COMMERCE_FEATURE_ENABLED",
    "PAYMENTS_HANDOFF_SECRET",
    "TICKETING_OFFLINE_PROVISIONING_SECRET",
    "PAYMENTS_DESTINATION_ID",
    "MERCADO_PAGO_CHECKOUT_MODE",
    "MERCADO_PAGO_PRODUCTION_CREDENTIALS_CONFIRMED",
    "PAYMENTS_SUBSCRIPTIONS_ENABLED",
  ]) {
    previous[key] = await readEnv(client, webServiceId, key);
  }
  return previous;
}

async function restoreRuntimeEnv(client, webServiceId, previousEnv) {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value == null) await deleteEnv(client, webServiceId, key);
    else await writeEnv(client, webServiceId, key, value);
  }
}

function summarizeCommerceRuntimeEnvironment(environment) {
  const paymentsHandoff = String(
    environment?.PAYMENTS_HANDOFF_SECRET ?? "",
  ).trim();
  const ticketingOffline = String(
    environment?.TICKETING_OFFLINE_PROVISIONING_SECRET ?? "",
  ).trim();
  const destination = String(environment?.PAYMENTS_DESTINATION_ID ?? "").trim();

  const secretState = (value) =>
    !value ? "absent" : value.length >= 32 ? "existing" : "invalid";
  const destinationState = !destination
    ? "absent"
    : destination === COMMERCE_DESTINATION_ID
      ? "existing"
      : "invalid";

  return Object.freeze({
    paymentsHandoff: secretState(paymentsHandoff),
    ticketingOffline: secretState(ticketingOffline),
    destination: destinationState,
    ready:
      paymentsHandoff.length >= 32 &&
      ticketingOffline.length >= 32 &&
      destination === COMMERCE_DESTINATION_ID,
  });
}

async function ensureCommerceRuntimeEnvironment(client, webServiceId) {
  const [paymentsHandoffSecret, ticketingOfflineSecret, destinationId] =
    await Promise.all([
      readEnv(client, webServiceId, "PAYMENTS_HANDOFF_SECRET"),
      readEnv(client, webServiceId, "TICKETING_OFFLINE_PROVISIONING_SECRET"),
      readEnv(client, webServiceId, "PAYMENTS_DESTINATION_ID"),
    ]);

  async function ensureSecret(key, observed) {
    const value = String(observed ?? "").trim();
    if (value) {
      if (value.length < 32) throw new Error(`${key}_INVALID`);
      return "existing";
    }
    const generated = randomBytes(48).toString("base64url");
    await writeEnv(client, webServiceId, key, generated);
    return "generated";
  }

  const paymentsHandoff = await ensureSecret(
    "PAYMENTS_HANDOFF_SECRET",
    paymentsHandoffSecret,
  );
  const ticketingOffline = await ensureSecret(
    "TICKETING_OFFLINE_PROVISIONING_SECRET",
    ticketingOfflineSecret,
  );

  const normalizedDestination = String(destinationId ?? "").trim();
  let destination = "existing";
  if (!normalizedDestination) {
    await writeEnv(
      client,
      webServiceId,
      "PAYMENTS_DESTINATION_ID",
      COMMERCE_DESTINATION_ID,
    );
    destination = "canonicalized";
  } else if (normalizedDestination !== COMMERCE_DESTINATION_ID) {
    throw new Error("PAYMENTS_DESTINATION_ID_PRODUCTION_INVALID");
  }

  return Object.freeze({
    paymentsHandoff,
    ticketingOffline,
    destination,
    ready: true,
  });
}

function previousSource(
  service,
  previousReleaseSha,
  imageRepository,
  registryCredentialId,
) {
  const details = nativeDetails(service);
  const source = {
    repo: String(service.repo ?? ""),
    branch: String(service.branch ?? "main"),
    runtime: runtime(service),
    buildCommand: String(details.buildCommand ?? ""),
    startCommand: String(details.startCommand ?? ""),
    preDeployCommand: String(
      service?.serviceDetails?.preDeployCommand ??
        details.preDeployCommand ??
        "",
    ),
    healthCheckPath: String(service?.serviceDetails?.healthCheckPath ?? ""),
    maxShutdownDelaySeconds: Number(
      service?.serviceDetails?.maxShutdownDelaySeconds ?? 30,
    ),
    previousReleaseSha,
  };

  if (source.runtime === "image") {
    const image = trustedPreviousImageIdentity(service, imageRepository);
    return Object.freeze({
      ...source,
      imagePath: image.imagePath,
      imageDigest: image.imageDigest,
      imageOwnerId: String(service.ownerId ?? ""),
      registryCredentialId: registryCredentialId || null,
    });
  }

  if (!source.repo || !source.runtime) {
    throw new Error("PRODUCTION_PREVIOUS_SOURCE_IDENTITY_INCOMPLETE");
  }
  return Object.freeze(source);
}

function sourceMatchesSnapshot(service, source) {
  const details = nativeDetails(service);
  const common =
    runtime(service) === source.runtime &&
    String(
      service?.serviceDetails?.preDeployCommand ??
        details.preDeployCommand ??
        "",
    ) === source.preDeployCommand &&
    String(service?.serviceDetails?.healthCheckPath ?? "") ===
      source.healthCheckPath &&
    Number(service?.serviceDetails?.maxShutdownDelaySeconds ?? 30) ===
      source.maxShutdownDelaySeconds &&
    String(service?.autoDeployTrigger ?? "off") === "off";

  if (!common) return false;
  if (source.runtime === "image") {
    return (
      String(service?.imagePath ?? "") === source.imagePath &&
      String(service?.ownerId ?? "") === source.imageOwnerId
    );
  }

  return (
    String(service?.repo ?? "") === source.repo &&
    String(service?.branch ?? "main") === source.branch &&
    String(details.buildCommand ?? "") === source.buildCommand &&
    String(details.startCommand ?? "") === source.startCommand
  );
}

async function restoreSource(client, serviceId, source) {
  if (!source.runtime) {
    throw new Error("ROLLBACK_SOURCE_IDENTITY_INCOMPLETE");
  }

  if (source.runtime === "image") {
    if (
      !source.imagePath ||
      !source.imageDigest ||
      !source.imageOwnerId ||
      !DIGEST_PATTERN.test(source.imageDigest)
    ) {
      throw new Error("ROLLBACK_IMAGE_IDENTITY_INCOMPLETE");
    }
    const image = {
      ownerId: source.imageOwnerId,
      imagePath: source.imagePath,
    };
    if (source.registryCredentialId) {
      image.registryCredentialId = source.registryCredentialId;
    }
    await client.patch(`/services/${serviceId}`, {
      autoDeployTrigger: "off",
      image,
      serviceDetails: {
        runtime: "image",
        preDeployCommand: source.preDeployCommand,
        healthCheckPath: source.healthCheckPath,
        maxShutdownDelaySeconds: source.maxShutdownDelaySeconds,
      },
    });
    return;
  }

  if (!source.repo) {
    throw new Error("ROLLBACK_SOURCE_IDENTITY_INCOMPLETE");
  }
  await client.patch(`/services/${serviceId}`, {
    repo: source.repo,
    branch: source.branch,
    autoDeployTrigger: "off",
    serviceDetails: {
      runtime: source.runtime,
      envSpecificDetails: {
        buildCommand: source.buildCommand,
        startCommand: source.startCommand,
      },
      preDeployCommand: source.preDeployCommand,
      healthCheckPath: source.healthCheckPath,
      maxShutdownDelaySeconds: source.maxShutdownDelaySeconds,
    },
  });
}

function deployMatchesPreviousIdentity(deploy, state) {
  if (!deploy) return false;
  if (state.previousSource?.runtime === "image") {
    try {
      assertDeployImageIdentity(
        deploy,
        state.previousSource.imagePath,
        state.previousSource.imageDigest,
      );
      return true;
    } catch {
      return false;
    }
  }
  return String(deploy.commit?.id ?? "") === state.previousReleaseSha;
}

async function previousDeployStillLive(client, state) {
  const deployPayload = await client.get(
    `/services/${state.webServiceId}/deploys?limit=20`,
  );
  const liveDeploy = normalizeDeploys(deployPayload).find(
    (deploy) => deploy.status === "live",
  );
  return (
    liveDeploy?.id === state.previousDeployId &&
    deployMatchesPreviousIdentity(liveDeploy, state)
  );
}

async function rollbackFromState({ client, state, stateFile }) {
  await restoreRuntimeEnv(client, state.webServiceId, state.previousEnv);
  state.commerceRuntimeCredentials =
    state.previousCommerceRuntimeCredentials ?? null;
  await restoreSource(client, state.webServiceId, state.previousSource);

  const restoredService = await client.get(`/services/${state.webServiceId}`);
  if (!sourceMatchesSnapshot(restoredService, state.previousSource)) {
    throw new Error("ROLLBACK_SOURCE_CONFIG_MISMATCH");
  }

  if (
    state.status === "deploying" &&
    (await previousDeployStillLive(client, state))
  ) {
    state.status = "restored_previous_live";
    state.rollbackDeployId = null;
    state.rollbackNotRequired = true;
    await fs.writeFile(stateFile, JSON.stringify(state), { mode: 0o600 });
    return state;
  }

  const rollback = await client.post(
    `/services/${state.webServiceId}/rollback`,
    { deployId: state.previousDeployId },
  );
  const rollbackId = String(rollback?.id ?? rollback?.deploy?.id ?? "");
  if (!rollbackId) throw new Error("ROLLBACK_DEPLOY_ID_REQUIRED");
  const liveRollback = await waitForDeploy(
    client,
    state.webServiceId,
    rollbackId,
  );
  if (!deployMatchesPreviousIdentity(liveRollback, state)) {
    throw new Error(
      state.previousSource?.runtime === "image"
        ? "ROLLBACK_RELEASE_IMAGE_MISMATCH"
        : "ROLLBACK_RELEASE_SHA_MISMATCH",
    );
  }

  state.status = "rolled_back";
  state.rollbackDeployId = rollbackId;
  state.rollbackNotRequired = false;
  await fs.writeFile(stateFile, JSON.stringify(state), { mode: 0o600 });
  return state;
}

async function buildRuntimeUrls(client, mysqlServiceId) {
  const urls = {};
  for (const [domain, canonicalKey, schema] of productionDatabaseDomains) {
    const [database, user, password] = await Promise.all([
      readEnv(client, mysqlServiceId, `${domain}_DATABASE_NAME`),
      readEnv(client, mysqlServiceId, `${domain}_RUNTIME_DATABASE_USER`),
      readEnv(client, mysqlServiceId, `${domain}_RUNTIME_DATABASE_PASSWORD`),
    ]);
    if (database !== schema || user !== `${schema}_runtime` || !password) {
      throw new Error(`PRODUCTION_MYSQL_RUNTIME_USER_INVALID_${domain}`);
    }
    urls[canonicalKey] = buildDatabaseUrl({
      host: "morro-digital-v2-production-mysql",
      port: 3306,
      database,
      user,
      password,
    });
  }
  return urls;
}

async function cutover({ environment = process.env, fetchImpl = fetch } = {}) {
  const token = required(environment, "RENDER_PRODUCTION_API_KEY");
  const workspaceId = required(environment, "RENDER_WORKSPACE_ID");
  const webServiceId = required(environment, "RENDER_PRODUCTION_SERVICE_ID");
  const mysqlServiceId = required(
    environment,
    "RENDER_PRODUCTION_MYSQL_SERVICE_ID",
  );
  const expectedSha = required(environment, "EXPECTED_SHA");
  const imageDigest = required(environment, "IMAGE_DIGEST");
  const imageRepository = required(environment, "IMAGE_REPOSITORY");
  const expectedMysqlSourceSha = required(
    environment,
    "EXPECTED_MYSQL_SOURCE_SHA",
  );
  const stateFile = required(environment, "CUTOVER_STATE_FILE");
  const evidenceFile = required(environment, "CUTOVER_EVIDENCE_FILE");

  if (!SHA_PATTERN.test(expectedSha)) throw new Error("EXPECTED_SHA_INVALID");
  if (!DIGEST_PATTERN.test(imageDigest))
    throw new Error("IMAGE_DIGEST_INVALID");
  if (!SHA_PATTERN.test(expectedMysqlSourceSha)) {
    throw new Error("EXPECTED_MYSQL_SOURCE_SHA_INVALID");
  }
  if (imageRepository !== "ghcr.io/luizanunciostoca/morro-digital-v2") {
    throw new Error("IMAGE_REPOSITORY_UNTRUSTED");
  }

  const client = createClient({ token, fetchImpl });
  const [
    service,
    mysqlService,
    deployPayload,
    mysqlDeployPayload,
    credentials,
    webEnvPayload,
  ] = await Promise.all([
    client.get(`/services/${webServiceId}`),
    client.get(`/services/${mysqlServiceId}`),
    client.get(`/services/${webServiceId}/deploys?limit=20`),
    client.get(`/services/${mysqlServiceId}/deploys?limit=20`),
    client.get(
      `/registrycredentials?ownerId=${encodeURIComponent(workspaceId)}&type=GITHUB&limit=100`,
    ),
    client.get(`/services/${webServiceId}/env-vars`),
  ]);

  if (
    service.id !== webServiceId ||
    service.ownerId !== workspaceId ||
    service.name !== "morro-digital-v2" ||
    service.type !== "web_service" ||
    service.serviceDetails?.region !== "virginia" ||
    String(service.autoDeployTrigger ?? "off") !== "off"
  ) {
    throw new Error("PRODUCTION_WEB_SERVICE_IDENTITY_INVALID");
  }
  if (
    mysqlService.id !== mysqlServiceId ||
    mysqlService.ownerId !== workspaceId ||
    mysqlService.name !== "morro-digital-v2-production-mysql" ||
    mysqlService.type !== "private_service" ||
    mysqlService.serviceDetails?.region !== "virginia"
  ) {
    throw new Error("PRODUCTION_MYSQL_SERVICE_IDENTITY_INVALID");
  }

  const browserDatabaseKeys = normalizeEnvVars(webEnvPayload)
    .map((entry) => String(entry?.key ?? ""))
    .filter((key) => /^VITE_.*_DATABASE_URL$/u.test(key));
  if (browserDatabaseKeys.length !== 0) {
    throw new Error("PRODUCTION_BROWSER_DATABASE_ENV_EXPOSED");
  }

  const liveMysqlDeploy = normalizeDeploys(mysqlDeployPayload).find(
    (deploy) => deploy.status === "live",
  );
  if (
    !liveMysqlDeploy?.id ||
    String(liveMysqlDeploy.commit?.id ?? "") !== expectedMysqlSourceSha
  ) {
    throw new Error("PRODUCTION_MYSQL_DR_SOURCE_STALE");
  }

  const liveDeploy = normalizeDeploys(deployPayload).find(
    (deploy) => deploy.status === "live",
  );
  if (!liveDeploy?.id) throw new Error("PRODUCTION_PREVIOUS_DEPLOY_REQUIRED");

  const previousEnv = await snapshotRuntimeEnv(client, webServiceId);
  const previousReleaseSha = resolvePreviousReleaseSha(liveDeploy, previousEnv);

  const explicitCredential = String(
    environment.RENDER_GHCR_REGISTRY_CREDENTIAL_ID ?? "",
  ).trim();
  const registryCredentialId = selectRegistryCredential(
    credentials,
    explicitCredential,
  );
  const previousSourceSnapshot = previousSource(
    service,
    previousReleaseSha,
    imageRepository,
    registryCredentialId,
  );

  const state = {
    contract: "MORRO-CANONICAL-PRODUCTION-DATABASE-CUTOVER-STATE",
    status: "prepared",
    expectedSha,
    imageDigest,
    imageRepository,
    expectedMysqlSourceSha,
    webServiceId,
    mysqlServiceId,
    previousDeployId: liveDeploy.id,
    previousReleaseSha,
    previousSource: previousSourceSnapshot,
    previousEnv,
    previousCommerceRuntimeCredentials:
      summarizeCommerceRuntimeEnvironment(previousEnv),
    registryCredentialId: registryCredentialId || null,
    newDeployId: null,
    rollbackNotRequired: false,
    commerceRuntimeCredentials: null,
  };
  await fs.writeFile(stateFile, JSON.stringify(state), { mode: 0o600 });

  let sourcePatchAttempted = false;
  let sourcePatched = false;
  try {
    const runtimeUrls = await buildRuntimeUrls(client, mysqlServiceId);
    await assertMysqlSourceStillProven(
      client,
      mysqlServiceId,
      expectedMysqlSourceSha,
    );
    state.commerceRuntimeCredentials = await ensureCommerceRuntimeEnvironment(
      client,
      webServiceId,
    );
    await fs.writeFile(stateFile, JSON.stringify(state), { mode: 0o600 });
    for (const [key, value] of Object.entries(runtimeUrls)) {
      await writeEnv(client, webServiceId, key, value);
    }
    await writeEnv(client, webServiceId, "EXPECTED_SHA", expectedSha);
    await writeEnv(client, webServiceId, "MORRO_RELEASE_SHA", expectedSha);
    await writeEnv(
      client,
      webServiceId,
      "MORRO_DATABASE_SCHEMA_MODE",
      "external",
    );
    await writeEnv(client, webServiceId, "COMMERCE_FEATURE_ENABLED", "true");
    await writeEnv(client, webServiceId, "MERCADO_PAGO_CHECKOUT_MODE", "test");
    await writeEnv(
      client,
      webServiceId,
      "MERCADO_PAGO_PRODUCTION_CREDENTIALS_CONFIRMED",
      "false",
    );
    await writeEnv(
      client,
      webServiceId,
      "PAYMENTS_SUBSCRIPTIONS_ENABLED",
      "false",
    );

    const imagePath = `${imageRepository}@${imageDigest}`;
    const image = { ownerId: workspaceId, imagePath };
    if (registryCredentialId) image.registryCredentialId = registryCredentialId;

    sourcePatchAttempted = true;
    await client.patch(`/services/${webServiceId}`, {
      autoDeployTrigger: "off",
      image,
      serviceDetails: {
        runtime: "image",
        preDeployCommand:
          "node apps/morro-digital-platform/tooling/production-runtime-database-predeploy.mjs && node apps/morro-digital-platform/tooling/payments-migrate.mjs",
        healthCheckPath: "/readyz",
        maxShutdownDelaySeconds: 30,
      },
    });
    sourcePatched = true;

    const deploy = await client.post(`/services/${webServiceId}/deploys`, {
      imageUrl: imagePath,
      clearCache: "do_not_clear",
    });
    const newDeployId = String(deploy?.id ?? deploy?.deploy?.id ?? "");
    if (!newDeployId) throw new Error("PRODUCTION_DEPLOY_ID_REQUIRED");
    state.newDeployId = newDeployId;
    state.status = "deploying";
    await fs.writeFile(stateFile, JSON.stringify(state), { mode: 0o600 });

    await waitForDeploy(client, webServiceId, newDeployId);
    const observed = await client.get(
      `/services/${webServiceId}/deploys/${newDeployId}`,
    );
    assertDeployImageIdentity(observed, imagePath, imageDigest);

    state.status = "live";
    await fs.writeFile(stateFile, JSON.stringify(state), { mode: 0o600 });
    await fs.writeFile(
      evidenceFile,
      JSON.stringify(publicEvidence(state), null, 2),
    );
    return publicEvidence(state);
  } catch (error) {
    if (sourcePatched) {
      try {
        const rolledBack = await rollbackFromState({
          client,
          state,
          stateFile,
        });
        await fs.writeFile(
          evidenceFile,
          JSON.stringify(publicEvidence(rolledBack), null, 2),
        );
      } catch {
        throw new Error("PRODUCTION_CUTOVER_FAILED_ROLLBACK_REQUIRED");
      }
    } else if (sourcePatchAttempted) {
      try {
        await restoreRuntimeEnv(client, webServiceId, state.previousEnv);
        state.commerceRuntimeCredentials =
          state.previousCommerceRuntimeCredentials ?? null;
        const observedService = await client.get(`/services/${webServiceId}`);
        if (!sourceMatchesSnapshot(observedService, state.previousSource)) {
          await restoreSource(client, webServiceId, state.previousSource);
          const reconciledService = await client.get(
            `/services/${webServiceId}`,
          );
          if (!sourceMatchesSnapshot(reconciledService, state.previousSource)) {
            throw new Error("ROLLBACK_SOURCE_CONFIG_MISMATCH");
          }
        }
        state.status = "restored_indeterminate_patch";
        await fs.writeFile(stateFile, JSON.stringify(state), { mode: 0o600 });
        await fs.writeFile(
          evidenceFile,
          JSON.stringify(publicEvidence(state), null, 2),
        );
      } catch {
        throw new Error("PRODUCTION_CUTOVER_FAILED_ROLLBACK_REQUIRED");
      }
    } else {
      await restoreRuntimeEnv(client, webServiceId, state.previousEnv);
      state.commerceRuntimeCredentials =
        state.previousCommerceRuntimeCredentials ?? null;
      state.status = "restored_pre_patch";
      await fs.writeFile(stateFile, JSON.stringify(state), { mode: 0o600 });
      await fs.writeFile(
        evidenceFile,
        JSON.stringify(publicEvidence(state), null, 2),
      );
    }
    throw error;
  }
}

async function rollback({ environment = process.env, fetchImpl = fetch } = {}) {
  const token = required(environment, "RENDER_PRODUCTION_API_KEY");
  const stateFile = required(environment, "CUTOVER_STATE_FILE");
  const evidenceFile = required(environment, "CUTOVER_EVIDENCE_FILE");
  const state = JSON.parse(await fs.readFile(stateFile, "utf8"));
  if (state.status === "rolled_back") {
    const evidence = publicEvidence(state);
    await fs.writeFile(evidenceFile, JSON.stringify(evidence, null, 2));
    return evidence;
  }
  if (state.status === "rollback_revalidation_failed") {
    await fs.writeFile(
      evidenceFile,
      JSON.stringify(publicEvidence(state), null, 2),
    );
    throw new Error("ROLLBACK_REVALIDATION_FAILED_TERMINAL");
  }

  const client = createClient({ token, fetchImpl });
  if (state.status === "restored_previous_live") {
    let stillLive = false;
    try {
      stillLive = await previousDeployStillLive(client, state);
    } catch {
      state.status = "rollback_revalidation_failed";
      state.rollbackNotRequired = false;
      await fs.writeFile(stateFile, JSON.stringify(state), { mode: 0o600 });
      await fs.writeFile(
        evidenceFile,
        JSON.stringify(publicEvidence(state), null, 2),
      );
      throw new Error("ROLLBACK_PREVIOUS_LIVE_REVALIDATION_FAILED");
    }
    if (!stillLive) {
      state.status = "rollback_revalidation_failed";
      state.rollbackNotRequired = false;
      await fs.writeFile(stateFile, JSON.stringify(state), { mode: 0o600 });
      await fs.writeFile(
        evidenceFile,
        JSON.stringify(publicEvidence(state), null, 2),
      );
      throw new Error("ROLLBACK_PREVIOUS_LIVE_STATE_STALE");
    }
    const evidence = publicEvidence(state);
    await fs.writeFile(evidenceFile, JSON.stringify(evidence, null, 2));
    return evidence;
  }

  const rolledBack = await rollbackFromState({ client, state, stateFile });
  await fs.writeFile(
    evidenceFile,
    JSON.stringify(publicEvidence(rolledBack), null, 2),
  );
  return publicEvidence(rolledBack);
}

async function main() {
  const mode = process.argv[2] ?? "cutover";
  const result =
    mode === "rollback"
      ? await rollback()
      : mode === "cutover"
        ? await cutover()
        : (() => {
            throw new Error("PRODUCTION_CUTOVER_MODE_INVALID");
          })();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        contract: "MORRO-CANONICAL-PRODUCTION-DATABASE-CUTOVER",
        status: "fail",
        reason: safeCode(error),
      })}\n`,
    );
    process.exitCode = 1;
  });
}

export { cutover, rollback };
