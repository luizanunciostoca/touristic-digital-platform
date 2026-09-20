import { describe, expect, it, vi } from "vitest";

import type { AnalyticsEvent } from "@touristic/analytics";
import type { AnalyticsIngestionService } from "@touristic/analytics/ingestion";

import { analyticsHttpPath, AnalyticsHttpTransport } from "./http-transport.js";

function service(
  status: "stored" | "replayed" = "stored",
): AnalyticsIngestionService {
  const event: AnalyticsEvent = {
    schemaVersion: "1",
    eventId: "event-001",
    name: "session_started",
    occurredAt: "2026-09-20T10:00:00.000Z",
    sessionId: "session-001",
    attributes: {},
  };

  return {
    ingest: vi.fn(async () => ({ status, event })),
    purgeExpired: vi.fn(async () => 0),
  };
}

describe("analytics HTTP transport", () => {
  it("records a new event and reports a replay deterministically", async () => {
    await expect(
      new AnalyticsHttpTransport(service()).handle({
        method: "POST",
        pathname: analyticsHttpPath,
        body: {},
      }),
    ).resolves.toEqual({
      status: 201,
      body: {
        data: {
          eventId: "event-001",
          status: "stored",
        },
      },
    });

    await expect(
      new AnalyticsHttpTransport(service("replayed")).handle({
        method: "POST",
        pathname: analyticsHttpPath,
        body: {},
      }),
    ).resolves.toEqual({
      status: 200,
      body: {
        data: {
          eventId: "event-001",
          status: "replayed",
        },
      },
    });
  });

  it("fails closed for invalid input and divergent replay", async () => {
    const invalid: AnalyticsIngestionService = {
      ingest: vi.fn(async () => {
        throw new Error("ANALYTICS_EVENT_INVALID");
      }),
      purgeExpired: vi.fn(async () => 0),
    };
    await expect(
      new AnalyticsHttpTransport(invalid).handle({
        method: "POST",
        pathname: analyticsHttpPath,
      }),
    ).resolves.toMatchObject({
      status: 400,
      body: { error: "ANALYTICS_EVENT_INVALID" },
    });

    const conflict: AnalyticsIngestionService = {
      ingest: vi.fn(async () => {
        throw new Error("ANALYTICS_EVENT_ID_CONFLICT");
      }),
      purgeExpired: vi.fn(async () => 0),
    };
    await expect(
      new AnalyticsHttpTransport(conflict).handle({
        method: "POST",
        pathname: analyticsHttpPath,
      }),
    ).resolves.toMatchObject({
      status: 409,
      body: { error: "ANALYTICS_EVENT_ID_CONFLICT" },
    });
  });
});
