import { describe, expect, it } from "vitest";

import { createAuditedCheckoutProvider } from "./payments-api.mjs";

describe("payments provider safe audit", () => {
  it("projects only allowlisted provider failure codes into audit", async () => {
    const audits = [];
    const error = Object.assign(new Error("must-not-be-logged"), {
      code: "MERCADO_PAGO_TEST_ACCOUNT_REQUIRED",
      secret: "must-not-be-logged",
    });
    const provider = createAuditedCheckoutProvider(
      { createCheckout: () => Promise.reject(error) },
      (event) => audits.push(event),
    );
    await expect(provider.createCheckout({})).rejects.toBe(error);
    expect(audits).toEqual([
      {
        action: "checkout.provider",
        result: "failure",
        reason: "test_account_required",
      },
    ]);
    expect(JSON.stringify(audits)).not.toContain("must-not-be-logged");
  });
  it("does not project unknown provider errors", async () => {
    const audits = [];
    const error = Object.assign(new Error("opaque"), {
      code: "UNKNOWN_PROVIDER_CODE",
    });
    const provider = createAuditedCheckoutProvider(
      { createCheckout: () => Promise.reject(error) },
      (event) => audits.push(event),
    );
    await expect(provider.createCheckout({})).rejects.toBe(error);
    expect(audits).toEqual([]);
  });
});
