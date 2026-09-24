import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const publicFile = (name) =>
  readFile(new URL(`../public/${name}`, import.meta.url), "utf8");

describe("Morro Commerce restaurant browser contract", () => {
  it("keeps restaurant reservation on canonical Commerce and Payments authorities", async () => {
    const [html, runtime] = await Promise.all([
      publicFile("commerce.html"),
      publicFile("commerce.js"),
    ]);

    expect(html).toContain('data-commerce-mode="table_reservation"');
    expect(html).toContain('id="commerce-reservation-form"');
    expect(runtime).toContain("/api/commerce/v1/restaurants/");
    expect(runtime).toContain("/availability?");
    expect(runtime).toContain("/reservations/");
    expect(runtime).toContain('const canonicalCheckoutPath = "/api/payments/v1/checkouts"');
    expect(runtime).toContain('"X-Checkout-Handoff-Token": descriptor.token');
    expect(runtime).toContain("payload.data?.verifiedPayment?.verified === true");
  });

  it("fails closed when canonical business identity is absent", async () => {
    const runtime = await publicFile("commerce.js");

    expect(runtime).toContain("businessIdPattern.test(businessId)");
    expect(runtime).toContain(
      "Este restaurante ainda não possui uma identidade Commerce vinculada.",
    );
    expect(runtime).not.toContain("slugToBusinessId");
    expect(runtime).not.toContain("businessId = placeLabel");
  });

  it("delegates non-table modes to the existing Ticketing runtime", async () => {
    const runtime = await publicFile("commerce.js");

    expect(runtime).toContain('new URL("/tickets.html", location.origin)');
    expect(runtime).toContain('mode === "activity_reservation"');
    expect(runtime).toContain('target.searchParams.set("mode", "tour")');
  });

  it("uses the shared Ticketing guest session rather than a parallel auth cookie", async () => {
    const runtime = await publicFile("commerce.js");

    expect(runtime).toContain(
      'const commerceSessionPath = "/api/ticketing/v1/consumer-session"',
    );
    expect(runtime).toContain('"X-CSRF-Token", state.csrfToken');
    expect(runtime).not.toContain("document.cookie");
  });
});
