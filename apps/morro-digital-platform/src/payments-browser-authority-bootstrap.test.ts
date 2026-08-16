import { describe, expect, it, vi } from "vitest";

import type { ValidatedBusinessCheckoutHandoff } from "@touristic/ordering";

import {
  PAYMENTS_HANDOFF_AUTHORITY_PATH,
  createServerIssuedPaymentsCheckoutAuthority,
} from "./payments-browser-authority-bootstrap.js";
import { PaymentsBrowserCheckoutError } from "./payments-browser-checkout-client.js";

const handoff = Object.freeze({
  sessionId: "browser_bootstrap_session",
  planId: "growth",
  contractor: Object.freeze({
    name: "Browser Guest",
    email: "browser@example.com",
    phone: "+55 75 99999-0000",
    document: "123.456.789-00",
  }),
  businessDraft: Object.freeze({
    demoBusinessId: "demo-browser",
    displayName: "Browser Business",
    categoryId: "restaurant",
    specialty: "Local",
    environment: "sandbox" as const,
    publishable: false as const,
  }),
  acceptedTerms: Object.freeze([
    Object.freeze({
      type: "terms" as const,
      version: "terms_v1",
      acceptedAt: "2026-08-16T07:00:00.000Z",
    }),
    Object.freeze({
      type: "privacy" as const,
      version: "privacy_v1",
      acceptedAt: "2026-08-16T07:00:00.000Z",
    }),
  ]),
  returnUrl: "https://morro.digital/checkout/return",
  tutorial: false as const,
  requiresPaymentsCapability: true as const,
}) satisfies ValidatedBusinessCheckoutHandoff;

const token = `${"a".repeat(48)}.${"b".repeat(48)}`;

describe("Payments browser authority bootstrap", () => {
  it("requests server authority and returns only the scoped handoff header", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: { handoffToken: token } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const authority = createServerIssuedPaymentsCheckoutAuthority(fetchFn);

    await expect(authority.resolveCreateHeaders(handoff)).resolves.toEqual({
      "X-Checkout-Handoff-Token": token,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(
      PAYMENTS_HANDOFF_AUTHORITY_PATH,
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify(handoff),
      }),
    );
    const [, init] = fetchFn.mock.calls[0] ?? [];
    expect(new Headers(init?.headers).has("x-csrf-token")).toBe(false);
    expect(new Headers(init?.headers).has("x-business-id")).toBe(false);
  });

  it("fails closed on malformed or rejected authority responses", async () => {
    const malformed = createServerIssuedPaymentsCheckoutAuthority(
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ data: { handoffToken: "not-a-token" } }), {
          status: 201,
        }),
      ),
    );
    await expect(malformed.resolveCreateHeaders(handoff)).rejects.toMatchObject({
      code: "PAYMENTS_BROWSER_INVALID_AUTHORITY",
    });

    const rejected = createServerIssuedPaymentsCheckoutAuthority(
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ error: "ORIGIN_DENIED" }), { status: 403 }),
      ),
    );
    await expect(rejected.resolveCreateHeaders(handoff)).rejects.toBeInstanceOf(
      PaymentsBrowserCheckoutError,
    );
  });
});
