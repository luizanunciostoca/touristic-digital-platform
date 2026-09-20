import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

import { createAnalyticsApi } from "./analytics-api.mjs";

function request(body, headers = {}) {
  const stream = Readable.from(body === null ? [] : [JSON.stringify(body)]);
  stream.method = "POST";
  stream.headers = {
    "content-type": "application/json",
    ...headers,
  };
  return stream;
}

function response() {
  const headers = new Map();
  return {
    statusCode: 0,
    body: "",
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    end(value = "") {
      this.body = String(value);
    },
  };
}

const valid = Object.freeze({
  schemaVersion: "1",
  eventId: "event-001",
  name: "assistant_query",
  occurredAt: "2026-09-20T10:00:00.000Z",
  sessionId: "session-random-001",
  destinationId: "morro-de-sao-paulo",
  locale: "pt-BR",
  source: "browser",
  attributes: {
    queryLength: 18,
    inputMode: "keyboard",
    hasPlaceContext: false,
    hasNavigationContext: false,
  },
});

describe("analytics runtime api", () => {
  it("accepts a sanitized canonical event without recording the raw session id", async () => {
    const record = vi.fn(async () => undefined);
    const api = createAnalyticsApi({ record });
    const res = response();

    await api.handle(request(valid), res);

    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body)).toEqual({
      data: { accepted: true, eventId: "event-001" },
    });
    expect(record).toHaveBeenCalledOnce();
    const recorded = record.mock.calls[0]?.[0];
    expect(recorded.sessionId).toBeUndefined();
    expect(recorded.visitorHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(recorded)).not.toContain("session-random-001");
  });

  it("rejects raw query text and unknown attributes", async () => {
    const record = vi.fn(async () => undefined);
    const api = createAnalyticsApi({ record });
    const res = response();

    await api.handle(
      request({
        ...valid,
        attributes: {
          ...valid.attributes,
          query: "onde comer sushi?",
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({
      error: "ANALYTICS_INVALID_ATTRIBUTES",
    });
    expect(record).not.toHaveBeenCalled();
  });

  it("rejects unknown top-level data and invalid methods", async () => {
    const record = vi.fn(async () => undefined);
    const api = createAnalyticsApi({ record });

    const invalid = response();
    await api.handle(request({ ...valid, email: "guest@example.com" }), invalid);
    expect(invalid.statusCode).toBe(400);
    expect(record).not.toHaveBeenCalled();

    const getRequest = request(valid);
    getRequest.method = "GET";
    const method = response();
    await api.handle(getRequest, method);
    expect(method.statusCode).toBe(405);
    expect(method.getHeader("allow")).toBe("POST");
  });

  it("fails closed when the recorder is unavailable", async () => {
    const api = createAnalyticsApi({
      record: vi.fn(async () => {
        throw new Error("sink unavailable");
      }),
    });
    const res = response();

    await api.handle(request(valid), res);

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body)).toEqual({
      error: "ANALYTICS_RECORDER_UNAVAILABLE",
    });
  });
});
