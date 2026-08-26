import { createPaymentsApi as createCorePaymentsApi } from "./payments-api.mjs";
import { createPaymentsCardApi } from "./payments-card-api.mjs";
import { createPaymentsSubscriptionApi } from "./payments-subscription-api.mjs";

const mercadoPagoWebhookPath = "/api/payments/v1/webhooks/sandbox";
const providerDataIdHeader = "x-morro-provider-data-id";
const maxProviderDataIdLength = 180;
const paymentsCoreStartupAttempts = 5;
const paymentsCoreStartupRetryBaseMs = 1_000;

const defaultSleep = (delayMs) =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

export async function startPaymentsCoreWithRetry(
  startAttempt,
  {
    attempts = paymentsCoreStartupAttempts,
    baseDelayMs = paymentsCoreStartupRetryBaseMs,
    sleep = defaultSleep,
  } = {},
) {
  if (typeof startAttempt !== "function") {
    throw new TypeError("PAYMENTS_CORE_START_ATTEMPT_REQUIRED");
  }
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5) {
    throw new TypeError("PAYMENTS_CORE_START_ATTEMPTS_INVALID");
  }
  if (
    !Number.isInteger(baseDelayMs) ||
    baseDelayMs < 0 ||
    baseDelayMs > 5_000
  ) {
    throw new TypeError("PAYMENTS_CORE_START_RETRY_DELAY_INVALID");
  }
  if (typeof sleep !== "function") {
    throw new TypeError("PAYMENTS_CORE_START_SLEEP_REQUIRED");
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (await startAttempt()) return true;
    if (attempt < attempts) {
      await sleep(baseDelayMs * attempt);
    }
  }
  return false;
}

function providerDataIdFromQuery(requestUrl) {
  const values = requestUrl.searchParams.getAll("data.id");
  if (values.length !== 1) return "";
  const value = values[0]?.trim() ?? "";
  return value && value.length <= maxProviderDataIdLength ? value : "";
}

export function bindMercadoPagoWebhookQueryContext(request, requestUrl) {
  if (requestUrl.pathname !== mercadoPagoWebhookPath) return request;

  request.headers = {
    ...(request.headers ?? {}),
    [providerDataIdHeader]: providerDataIdFromQuery(requestUrl),
  };
  return request;
}

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
      const coreReady = await startPaymentsCoreWithRetry(() => core.start());
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
      bindMercadoPagoWebhookQueryContext(request, requestUrl);
      await core.handle(request, response, requestUrl);
    },
  });
}
