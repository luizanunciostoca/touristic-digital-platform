import { createPaymentsApi as createCorePaymentsApi } from "./payments-api.mjs";
import { createPaymentsCardApi } from "./payments-card-api.mjs";
import { createPaymentsSubscriptionApi } from "./payments-subscription-api.mjs";

export function createPaymentsApi(options = {}) {
  const core = createCorePaymentsApi(options);
  const card = createPaymentsCardApi(options);
  const subscription = createPaymentsSubscriptionApi(options);
  let started = false;

  async function stopAll() {
    const results = await Promise.allSettled([
      subscription.stop(),
      card.stop(),
      core.stop(),
    ]);
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected?.status === "rejected") throw rejected.reason;
  }

  return Object.freeze({
    matches(pathname) {
      return (
        subscription.matches(pathname) ||
        card.matches(pathname) ||
        core.matches(pathname)
      );
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

      const subscriptionReady = await subscription.start();
      if (!subscriptionReady) {
        await Promise.allSettled([
          subscription.stop(),
          card.stop(),
          core.stop(),
        ]);
        return false;
      }

      started = true;
      return true;
    },

    async stop() {
      started = false;
      await stopAll();
    },

    async handle(request, response, requestUrl) {
      if (subscription.matches(requestUrl.pathname)) {
        await subscription.handle(request, response, requestUrl);
        return;
      }
      if (card.matches(requestUrl.pathname)) {
        await card.handle(request, response, requestUrl);
        return;
      }
      await core.handle(request, response, requestUrl);
    },
  });
}
