import {
  ContentAdminApplicationService,
  MySqlContentRepository,
  applyContentM156Schema,
  createContentPool,
} from "@touristic/content-server";

function unavailable() {
  return Object.freeze({ status: "unavailable", data: null });
}

function mappedError(error) {
  const code = error instanceof Error ? error.message : "";
  if (
    code === "CONTENT_INVALID_INPUT" ||
    code === "CONTENT_INVALID_FIELDS" ||
    code === "CONTENT_INVALID_STATUS" ||
    code === "CONTENT_INVALID_SCHEDULE" ||
    code === "CONTENT_INVALID_ID" ||
    code === "CONTENT_INVALID_LIMIT"
  ) {
    return Object.freeze({ status: "invalid", data: null, error: code });
  }
  if (code === "CONTENT_NOT_FOUND") {
    return Object.freeze({ status: "not_found", data: null, error: code });
  }
  if (code === "CONTENT_ALREADY_EXISTS") {
    return Object.freeze({ status: "conflict", data: null, error: code });
  }
  if (
    code === "CONTENT_TRANSITION_INVALID" ||
    code === "CONTENT_CONCURRENT_UPDATE"
  ) {
    return Object.freeze({ status: "conflict", data: null, error: code });
  }
  return Object.freeze({
    status: "unavailable",
    data: null,
    error: code || "CONTENT_ADMIN_UNAVAILABLE",
  });
}

export function createContentAdminRuntime({
  getEnvironmentValue = (key) => process.env[key] ?? "",
} = {}) {
  const databaseUrl = String(
    getEnvironmentValue("CONTENT_DATABASE_URL") || "",
  ).trim();
  let pool = null;
  let service = null;
  let startAttempted = false;
  let startError = databaseUrl ? "CONTENT_ADMIN_NOT_STARTED" : null;

  async function start() {
    if (service) return true;
    if (startAttempted) return false;
    startAttempted = true;
    if (!databaseUrl) {
      startError = "CONTENT_DATABASE_URL_NOT_CONFIGURED";
      return false;
    }
    try {
      pool = createContentPool(databaseUrl);
      await applyContentM156Schema(pool);
      service = new ContentAdminApplicationService(
        new MySqlContentRepository(pool),
      );
      startError = null;
      return true;
    } catch (error) {
      startError =
        error instanceof Error
          ? error.message.slice(0, 160)
          : "CONTENT_ADMIN_START_FAILED";
      if (pool) await pool.end().catch(() => undefined);
      pool = null;
      service = null;
      return false;
    }
  }

  async function stop() {
    const activePool = pool;
    pool = null;
    service = null;
    startAttempted = false;
    if (activePool) await activePool.end();
  }

  function readinessCheck() {
    return Object.freeze({
      status: service ? "pass" : "fail",
      critical: false,
      detail: service
        ? "content-admin-ready"
        : startError || "CONTENT_ADMIN_UNAVAILABLE",
    });
  }

  async function adminList(input = {}) {
    if (!service) return unavailable();
    try {
      const data = await service.list(input);
      return Object.freeze({ status: "found", data });
    } catch (error) {
      return mappedError(error);
    }
  }

  async function adminRead(id) {
    if (!service) return unavailable();
    try {
      const data = await service.read(id);
      return Object.freeze({
        status: data ? "found" : "not_found",
        data,
      });
    } catch (error) {
      return mappedError(error);
    }
  }

  async function adminCreate(input) {
    if (!service) return unavailable();
    try {
      const data = await service.create(input);
      return Object.freeze({ status: "created", data });
    } catch (error) {
      return mappedError(error);
    }
  }

  async function adminRevise(id, fields) {
    if (!service) return unavailable();
    try {
      const data = await service.revise(id, fields);
      return Object.freeze({ status: "updated", data });
    } catch (error) {
      return mappedError(error);
    }
  }

  async function adminTransition(id, input) {
    if (!service) return unavailable();
    try {
      const data = await service.transition(id, input);
      return Object.freeze({ status: "updated", data });
    } catch (error) {
      return mappedError(error);
    }
  }

  return Object.freeze({
    start,
    stop,
    readinessCheck,
    adminList,
    adminRead,
    adminCreate,
    adminRevise,
    adminTransition,
  });
}
