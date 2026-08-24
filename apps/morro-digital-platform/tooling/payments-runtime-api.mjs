import { createPaymentsApi as createCorePaymentsApi } from "./payments-api.mjs";
import { createPaymentsCardApi } from "./payments-card-api.mjs";

export function createPaymentsApi(options = {}) {
  const core = createCorePaymentsApi(options);
  const card = createPaymentsCardApi(options);
  let started = false;

  return Object.freeze({
    matches(pathname) {
      return card.matches(pathname) || core.matches(pathname);
    },

    async start() {
      if (started) return true;
      const coreReady = await core.start();
      if (!coreReady) return false;
      const cardReady = await card.start();
      if (!cardReady) {
        await Promise.allSettled([card.stop(), core.stop()]);
        return false;
      }
      started = true;
      return true;
    },

    async stop() {
      started = false;
      const results = await Promise.allSettled([card.stop(), core.stop()]);
      const rejected = results.find((result) => result.status === "rejected");
      if (rejected?.status === "rejected") throw rejected.reason;
    },

    async handle(request, response, requestUrl) {
      if (card.matches(requestUrl.pathname)) {
        await card.handle(request, response, requestUrl);
        return;
      }
      await core.handle(request, response, requestUrl);
    },
  });
}
