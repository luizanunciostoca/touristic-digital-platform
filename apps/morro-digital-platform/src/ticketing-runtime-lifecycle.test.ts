import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("Ticketing runtime lifecycle", () => {
  it("starts Ticketing before the HTTP server can accept traffic", async () => {
    const source = await readFile(
      new URL("../tooling/dev-server.mjs", import.meta.url),
      "utf8",
    );

    const startup = source.indexOf(
      "ticketingRuntimeReady = await ticketingApi.start();",
    );
    const serverCreation = source.indexOf("const server = createServer");

    expect(startup).toBeGreaterThan(0);
    expect(serverCreation).toBeGreaterThan(startup);
    expect(source).not.toContain("getTicketingApi");
    expect(source).not.toContain("ticketingApiPromise");
  });

  it("preflights the mandatory Financial authority schema before readiness", async () => {
    const source = await readFile(
      new URL("../tooling/ticketing-api.mjs", import.meta.url),
      "utf8",
    );

    const paymentsPreflight = source.indexOf(
      "SELECT payment_id FROM financial_payments LIMIT 1",
    );
    const resultsPreflight = source.indexOf(
      "SELECT result_id FROM financial_payment_results LIMIT 1",
    );
    const ready = source.indexOf("started = true;", resultsPreflight);

    expect(paymentsPreflight).toBeGreaterThan(0);
    expect(resultsPreflight).toBeGreaterThan(paymentsPreflight);
    expect(ready).toBeGreaterThan(resultsPreflight);
  });

  it("makes Ticketing readiness critical and binds graceful shutdown", async () => {
    const source = await readFile(
      new URL("../tooling/dev-server.mjs", import.meta.url),
      "utf8",
    );

    expect(source).toContain('name: "ticketing-runtime"');
    expect(source).toContain(
      'detail: ticketingRuntimeReady\n        ? "ticketing-runtime-ready"\n        : "TICKETING_RUNTIME_UNAVAILABLE"',
    );
    expect(source).toContain("ticketingApi.stop()");
    expect(source).toContain('process.once("SIGINT"');
    expect(source).toContain('process.once("SIGTERM"');
  });
});
