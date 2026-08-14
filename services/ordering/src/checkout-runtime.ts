import { randomUUID } from "node:crypto";

import type {
  CheckoutClockPort,
  CheckoutIdentityPort,
} from "@touristic/ordering";

export function createNodeCheckoutIdentityPort(): CheckoutIdentityPort {
  return Object.freeze({
    allocateOrderId(): string {
      return "ord_" + randomUUID();
    },
    allocatePaymentId(): string {
      return "pay_" + randomUUID();
    },
  });
}

export const systemCheckoutClock: CheckoutClockPort = Object.freeze({
  now(): string {
    return new Date().toISOString();
  },
});
