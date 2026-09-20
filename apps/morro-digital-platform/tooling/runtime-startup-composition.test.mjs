import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("runtime startup composition", () => {
  it("eagerly composes Ticketing and exposes it to readiness", async () => {
    const source = await readFile(
      new URL("./dev-server.mjs", import.meta.url),
      "utf8",
    );

    expect(source).toContain(
      'const { createTicketingApi } = await import("./ticketing-api.mjs");',
    );
    expect(source).toContain(
      "ticketingRuntimeReady = await ticketingApi.start();",
    );
    expect(source).toContain('name: "ticketing-runtime"');
    expect(source).toContain("ticketingApi.stop()");
    expect(source).not.toContain("getTicketingApi()");
    expect(source).not.toContain("ticketingApiPromise");
  });

  it("uses canonical workspace package imports for Ticketing runtime dependencies", async () => {
    const source = await readFile(
      new URL("./ticketing-api.mjs", import.meta.url),
      "utf8",
    );

    expect(source).toContain('import("@touristic/ticketing")');
    expect(source).toContain('import("@touristic/ticketing-server")');
    expect(source).not.toContain("../../../packages/ticketing/dist/");
    expect(source).not.toContain("../../../services/ticketing/dist/");
  });

  it("includes Assistant provider state in platform readiness", async () => {
    const source = await readFile(
      new URL("./dev-server.mjs", import.meta.url),
      "utf8",
    );

    expect(source).toContain('name: "assistant-provider"');
    expect(source).toContain("assistantApi.readinessCheck()");
  });
});
