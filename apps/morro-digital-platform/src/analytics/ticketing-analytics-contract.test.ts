import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const publicRoot = new URL("../../public/", import.meta.url);

async function readPublic(name: string): Promise<string> {
  return readFile(new URL(name, publicRoot), "utf8");
}

describe("ticketing analytics funnel contract", () => {
  it("loads the canonical analytics package and browser bridge on Ticketing", async () => {
    const html = await readPublic("tickets.html");
    const runtime = await readPublic("ticketing.js");

    expect(html).toContain(
      '"@touristic/analytics": "/packages/analytics/dist/index.js"',
    );
    expect(runtime).toContain("installMorroBrowserAnalytics");
    expect(runtime).toContain(
      "/apps/morro-digital-platform/dist/analytics/browser-analytics.js",
    );
  });

  it("emits all five authoritative commerce milestones", async () => {
    const runtime = await readPublic("ticketing.js");

    for (const milestone of [
      "offerSelected",
      "reservationStarted",
      "checkoutStarted",
      "paymentApproved",
      "ticketIssued",
    ]) {
      expect(runtime).toContain(
        `ANALYTICS_TRANSACTION_EVENTS.${milestone}`,
      );
    }
  });

  it("keeps PII and payment secrets outside analytics event detail blocks", async () => {
    const runtime = await readPublic("ticketing.js");
    const analyticsBlocks = [
      ...runtime.matchAll(
        /emitAnalyticsOnce\([\s\S]*?ANALYTICS_TRANSACTION_EVENTS\.[A-Za-z]+,[\s\S]*?\n\s*\},\n\s*\);/gu,
      ),
    ].map((match) => match[0]);

    expect(analyticsBlocks).toHaveLength(5);
    const serialized = analyticsBlocks.join("\n");

    for (const forbidden of [
      "holder",
      "holderName",
      "holderEmail",
      "holderPhone",
      "holderDocument",
      "statusToken",
      "handoffToken",
      "minorUnits",
      "amount:",
      "paymentReference",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("stores only non-sensitive correlation context for ticket issuance", async () => {
    const runtime = await readPublic("ticketing.js");
    const contextBlock = runtime.slice(
      runtime.indexOf("function rememberAnalyticsReservationContext"),
      runtime.indexOf("function analyticsReservationContext"),
    );

    expect(contextBlock).toContain("orderId");
    expect(contextBlock).toContain("currency");
    expect(contextBlock).toContain("ticketType");
    expect(contextBlock).not.toContain("email");
    expect(contextBlock).not.toContain("phone");
    expect(contextBlock).not.toContain("document");
    expect(contextBlock).not.toContain("token");
  });
});
