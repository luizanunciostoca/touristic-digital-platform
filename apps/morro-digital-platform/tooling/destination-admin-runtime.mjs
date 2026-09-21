export function createDestinationAdminRuntime(environment = process.env) {
  const databaseUrl = String(
    environment.DESTINATIONS_DATABASE_URL ?? "",
  ).trim();
  if (!databaseUrl) {
    return Object.freeze({
      state: "unavailable",
      reason: "DESTINATIONS_DATABASE_URL_REQUIRED",
      service: null,
      async start() {},
      async stop() {},
      async readiness() {
        return Object.freeze({
          ready: false,
          reason: "DESTINATIONS_DATABASE_URL_REQUIRED",
        });
      },
    });
  }

  let pool = null;
  let service = null;
  let started = false;

  return Object.freeze({
    state: "configured",
    get service() {
      return service;
    },
    async start() {
      if (started) return;
      const {
        applyDestinationsSchema,
        bootstrapMorroDeSaoPauloDestination,
        createDestinationAdminService,
        createDestinationsMySqlPool,
      } = await import("@touristic/destinations-server");
      pool = createDestinationsMySqlPool(databaseUrl);
      service = createDestinationAdminService(pool);
      try {
        await applyDestinationsSchema(pool);
        const bootstrapped = await bootstrapMorroDeSaoPauloDestination(service);
        if (!["created", "found"].includes(bootstrapped.status)) {
          throw new Error("DESTINATION_BOOTSTRAP_FAILED");
        }
        started = true;
      } catch (error) {
        await pool.end().catch(() => undefined);
        pool = null;
        service = null;
        throw error;
      }
    },
    async stop() {
      const activePool = pool;
      pool = null;
      service = null;
      started = false;
      if (activePool) await activePool.end();
    },
    async readiness() {
      if (!started || !service) {
        return Object.freeze({
          ready: false,
          reason: "DESTINATIONS_NOT_STARTED",
        });
      }
      try {
        await service.list();
        return Object.freeze({ ready: true });
      } catch {
        return Object.freeze({
          ready: false,
          reason: "DESTINATIONS_DATABASE_UNAVAILABLE",
        });
      }
    },
  });
}
