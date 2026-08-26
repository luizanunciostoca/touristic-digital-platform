import { describe, expect, it } from "vitest";

import { readProviderResponseMetadata } from "./provider-retry.js";

describe("readProviderResponseMetadata provider messages", () => {
  it("preserves a bounded human-readable provider message as a safe diagnostic code", async () => {
    const response = new Response(
      JSON.stringify({
        message: "Payer email is invalid for this test subscription",
        status: 403,
      }),
      {
        status: 403,
        headers: {
          "content-type": "application/json",
          "x-request-id": "request-123",
        },
      },
    );

    await expect(readProviderResponseMetadata(response)).resolves.toEqual({
      providerRequestId: "request-123",
      retryAfter: null,
      contentType: "application/json",
      providerErrorCode: "Payer_email_is_invalid_for_this_test_subscription",
      providerBodyStatus: 403,
      providerCauseCodes: [],
    });
  });

  it("prefers a provider error code when the payload already exposes one", async () => {
    const response = new Response(
      JSON.stringify({
        error: "access_denied",
        message: "Access denied for this operation",
        status: 403,
      }),
      {
        status: 403,
        headers: { "content-type": "application/json" },
      },
    );

    const metadata = await readProviderResponseMetadata(response);
    expect(metadata.providerErrorCode).toBe("access_denied");
    expect(metadata.providerBodyStatus).toBe(403);
  });
});
