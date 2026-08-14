import type {
  CheckoutHttpRateLimitPort,
  CheckoutRateLimitDecision,
  CheckoutRateLimitRequest,
} from "./checkout-http-transport.js";

export function createInMemoryCheckoutRateLimitPort(
  maxKeys = 10_000,
): CheckoutHttpRateLimitPort {
  if (!Number.isSafeInteger(maxKeys) || maxKeys < 100) {
    throw new Error("CHECKOUT_RATE_LIMIT_MAX_KEYS_INVALID");
  }
  const attempts = new Map<string, number[]>();

  return Object.freeze({
    consume(
      input: CheckoutRateLimitRequest,
    ): Promise<CheckoutRateLimitDecision> {
      const mapKey = input.bucket + ":" + input.key;
      if (
        !input.key ||
        input.key.length > 400 ||
        !Number.isSafeInteger(input.limit) ||
        input.limit <= 0 ||
        !Number.isSafeInteger(input.windowMs) ||
        input.windowMs <= 0 ||
        !Number.isFinite(input.nowMs)
      ) {
        return Promise.resolve(
          Object.freeze({
            allowed: false,
            retryAfterSeconds: 60,
          }),
        );
      }

      const active = (attempts.get(mapKey) ?? []).filter(
        (timestamp) => input.nowMs - timestamp < input.windowMs,
      );
      if (active.length >= input.limit) {
        const first = active[0] ?? input.nowMs;
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((input.windowMs - (input.nowMs - first)) / 1_000),
        );
        attempts.delete(mapKey);
        attempts.set(mapKey, active);
        return Promise.resolve(
          Object.freeze({ allowed: false, retryAfterSeconds }),
        );
      }

      if (!attempts.has(mapKey) && attempts.size >= maxKeys) {
        const oldest = attempts.keys().next().value as string | undefined;
        if (oldest) attempts.delete(oldest);
      }
      active.push(input.nowMs);
      attempts.delete(mapKey);
      attempts.set(mapKey, active);
      return Promise.resolve(
        Object.freeze({ allowed: true, retryAfterSeconds: 0 }),
      );
    },
  });
}
