const runtimePackage = "@touristic/analytics-server";
const maxRuntimeEntries = 1_000;

function boundedLimit(value) {
  return Math.max(1, Math.min(250, Math.floor(Number(value) || 100)));
}

export function createAdminAuditRuntime({
  getEnvironmentValue = (key) => process.env[key] ?? "",
  loadRuntime = () => import(runtimePackage),
} = {}) {
  const production = getEnvironmentValue("NODE_ENV") === "production";
  const databaseUrl = String(
    getEnvironmentValue("CONTROL_CENTER_AUDIT_DATABASE_URL") ?? "",
  ).trim();

  const runtimeEntries = [];
  let pool = null;
  let persistentStore = null;
  let started = false;
  let ready = false;

  function appendRuntime(entry) {
    runtimeEntries.push(Object.freeze({ ...entry }));
    if (runtimeEntries.length > maxRuntimeEntries) {
      runtimeEntries.splice(0, runtimeEntries.length - maxRuntimeEntries);
    }
  }

  async function start() {
    if (started) return ready;
    started = true;

    if (!databaseUrl) {
      ready = !production;
      return ready;
    }

    try {
      const runtime = await loadRuntime();
      pool = runtime.createAnalyticsMySqlPool(databaseUrl);
      await runtime.applyControlCenterAuditSchema(pool);
      persistentStore = new runtime.MySqlControlCenterAuditStore(pool);
      ready = true;
      return true;
    } catch {
      await pool?.end?.().catch(() => undefined);
      pool = null;
      persistentStore = null;
      ready = false;
      return false;
    }
  }

  async function stop() {
    const activePool = pool;
    pool = null;
    persistentStore = null;
    ready = false;
    started = false;
    await activePool?.end?.();
  }

  return Object.freeze({
    start,
    stop,

    readinessCheck() {
      if (persistentStore && ready) {
        return Object.freeze({
          status: "pass",
          critical: production,
          detail: "control-center-audit-mysql-ready",
        });
      }

      if (!production && started && ready) {
        return Object.freeze({
          status: "warn",
          critical: false,
          detail: "control-center-audit-runtime-fallback",
        });
      }

      return Object.freeze({
        status: "fail",
        critical: production,
        detail: databaseUrl
          ? "CONTROL_CENTER_AUDIT_DATABASE_UNAVAILABLE"
          : "CONTROL_CENTER_AUDIT_DATABASE_URL_REQUIRED",
      });
    },

    durability() {
      return persistentStore
        ? "mysql-append-only"
        : "runtime-projection-only";
    },

    async append(entry) {
      appendRuntime(entry);
      if (persistentStore) {
        await persistentStore.append(entry);
        return;
      }
      if (production) {
        throw new Error("CONTROL_CENTER_AUDIT_DURABILITY_REQUIRED");
      }
    },

    async list(limit = 100) {
      if (persistentStore) {
        return persistentStore.list(boundedLimit(limit));
      }
      const count = boundedLimit(limit);
      return Object.freeze(runtimeEntries.slice(-count).reverse());
    },
  });
}
