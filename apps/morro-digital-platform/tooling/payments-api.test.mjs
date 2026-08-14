import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { createPaymentsApi } from "./payments-api.mjs";

function request({ method = "GET", headers = {}, body } = {}) {
  const stream = Readable.from(body === undefined ? [] : [body]);
  stream.method = method;
  stream.headers = headers;
  stream.socket = { remoteAddress: "203.0.113.20" };
  return stream;
}

function responseCapture() {
  const headers = new Map();
  return {
    statusCode: 0,
    payload: "",
    setHeader(name, value) {
      headers.set(name.toLowerCase(), String(value));
    },
    end(value = "") {
      this.payload = String(value);
    },
    header(name) {
      return headers.get(name.toLowerCase());
    },
  };
}

describe("M139 payments API runtime boundary", () => {
  it("stays fail-closed when operational configuration is absent", async () => {
    const api = createPaymentsApi({
      authApi: {},
      getEnvironmentValue: () => "",
      audit: () => undefined,
    });
    await expect(api.start()).resolves.toBe(false);
    const response = responseCapture();

    await api.handle(
      request(),
      response,
      new URL("http://localhost/api/payments/v1/checkouts/ord_missing_123"),
    );

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.payload)).toEqual({
      error: "CHECKOUT_UNAVAILABLE",
    });
    expect(response.header("cache-control")).toBe("no-store");
    expect(response.header("x-correlation-id")).toMatch(/^corr_/u);
  });

  it("parses bounded JSON and propagates a server correlation ID", async () => {
    let captured;
    const api = createPaymentsApi({
      transport: {
        handle(input) {
          captured = input;
          return Promise.resolve({
            status: 201,
            body: { data: { checkoutId: "ord_runtime_123" } },
            headers: { "Cache-Control": "no-store" },
          });
        },
      },
      audit: () => undefined,
    });
    const response = responseCapture();
    const body = JSON.stringify({ sessionId: "runtime_session" });

    await api.handle(
      request({
        method: "POST",
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-length": String(Buffer.byteLength(body)),
        },
        body,
      }),
      response,
      new URL("http://localhost/api/payments/v1/checkouts"),
    );

    expect(response.statusCode).toBe(201);
    expect(captured).toMatchObject({
      method: "POST",
      pathname: "/api/payments/v1/checkouts",
      body: { sessionId: "runtime_session" },
      clientIp: "203.0.113.20",
    });
    expect(captured.correlationId).toMatch(/^corr_/u);
    expect(response.header("x-correlation-id")).toBe(
      captured.correlationId,
    );
  });

  it("rejects unsupported content types before the transport", async () => {
    let calls = 0;
    const api = createPaymentsApi({
      transport: {
        handle() {
          calls += 1;
          return Promise.reject(new Error("UNEXPECTED_CALL"));
        },
      },
      audit: () => undefined,
    });
    const response = responseCapture();

    await api.handle(
      request({
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "{}",
      }),
      response,
      new URL("http://localhost/api/payments/v1/checkouts"),
    );

    expect(response.statusCode).toBe(415);
    expect(JSON.parse(response.payload)).toEqual({
      error: "UNSUPPORTED_MEDIA_TYPE",
    });
    expect(calls).toBe(0);
  });
});
