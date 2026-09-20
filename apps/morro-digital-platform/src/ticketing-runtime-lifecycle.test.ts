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
