import {
  applyDestinationsSchema,
  bootstrapMorroDeSaoPauloDestination,
  createDestinationAdminService,
  createDestinationsMySqlPool,
} from "@touristic/destinations-server";

export function createDestinationAdminRuntime(environment = process.env) {
  const databaseUrl = String(environment.DESTINATIONS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    return Object.freeze({
      state: "unavailable",
      reason: "DESTINATIONS_DATABASE_URL_REQUIRED",
      async start() {},
      async stop() {},
      async readiness() {
        return Object.freeze({ ready: false, reason: "DESTINATIONS_DATABASE_URL_REQUIRED" });
      },
    });
  }

  const pool = createDestinationsMySqlPool(databaseUrl);
  const service = createDestinationAdminService(pool);
  let started = false;

  return Object.freeze({
    state: "configured",
    service,
    async start() {
      if (started) return;
      await applyDestinationsSchema(pool);
      const bootstrapped = await bootstrapMorroDeSaoPauloDestination(service);
      if (!["created", "found"].includes(bootstrapped.status)) {
        throw new Error("DESTINATION_BOOTSTRAP_FAILED");
      }
      started = true;
    },
    async stop() {
      if (!started) return;
      await pool.end();
      started = false;
    },
    async readiness() {
      if (!started) return Object.freeze({ ready: false, reason: "DESTINATIONS_NOT_STARTED" });
      try {
        await service.list();
        return Object.freeze({ ready: true });
      } catch {
        return Object.freeze({ ready: false, reason: "DESTINATIONS_DATABASE_UNAVAILABLE" });
      }
    },
  });
}
