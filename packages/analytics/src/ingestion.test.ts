import { describe, expect, it, vi } from "vitest";

import {
  createAnalyticsIngestionService,
  parseAnalyticsWireEvent,
  type AnalyticsIngestionRecord,
  type AnalyticsIngestionRepositoryPort,
} from "./ingestion.js";

const validWireEvent = {
  schemaVersion: "1",
  eventId: "event-001",
  name: "place_viewed",
  occurredAt: "2026-09-20T10:00:00.000Z",
  sessionId: "session-001",
  destinationId: "morro-de-sao-paulo",
  locale: "pt-BR",
  source: "browser",
  attributes: {
    placeId: "segunda-praia",
    categoryId: "beaches",
  },
};

describe("analytics wire parsing", () => {
  it("accepts the canonical privacy-safe envelope", () => {
    expect(parseAnalyticsWireEvent(validWireEvent)).toMatchObject({
      eventId: "event-001",
      name: "place_viewed",
      sessionId: "session-001",
      attributes: {
        placeId: "segunda-praia",
        categoryId: "beaches",
      },
    });
  });

  it("rejects unknown event names and raw query text", () => {
    expect(
      parseAnalyticsWireEvent({
        ...validWireEvent,
        name: "unknown_event",
      }),
    ).toBeNull();

    expect(
      parseAnalyticsWireEvent({
        ...validWireEvent,
        name: "search_submitted",
        attributes: {
          query: "praia tranquila",
          queryLength: 15,
        },
      }),
    ).toBeNull();
  });
});

describe("analytics ingestion service", () => {
  it("assigns retention server-side and preserves repository replay result", async () => {
    const records: AnalyticsIngestionRecord[] = [];
    const repository: AnalyticsIngestionRepositoryPort = {
      record: vi.fn(async (record) => {
        records.push(record);
        return "stored" as const;
      }),
      purgeExpired: vi.fn(async () => 0),
    };
    const service = createAnalyticsIngestionService({
      repository,
      retentionDays: 90,
      now: () => new Date("2026-09-20T12:00:00.000Z"),
    });

    await expect(service.ingest(validWireEvent)).resolves.toMatchObject({
      status: "stored",
      event: { eventId: "event-001" },
    });
    expect(records[0]).toMatchObject({
      receivedAt: "2026-09-20T12:00:00.000Z",
      retentionUntil: "2026-12-19T12:00:00.000Z",
    });
  });

  it("purges only through the repository cutoff owned by the server clock", async () => {
    const purgeExpired = vi.fn(async () => 7);
    const repository: AnalyticsIngestionRepositoryPort = {
      record: vi.fn(async () => "stored" as const),
      purgeExpired,
    };
    const service = createAnalyticsIngestionService({
      repository,
      retentionDays: 30,
      now: () => new Date("2026-09-20T12:00:00.000Z"),
    });

    await expect(service.purgeExpired()).resolves.toBe(7);
    expect(purgeExpired).toHaveBeenCalledWith(
      "2026-09-20T12:00:00.000Z",
    );
  });

  it("rejects invalid retention configuration", () => {
    const repository: AnalyticsIngestionRepositoryPort = {
      record: vi.fn(async () => "stored" as const),
      purgeExpired: vi.fn(async () => 0),
    };
    expect(() =>
      createAnalyticsIngestionService({
        repository,
        retentionDays: 0,
      }),
    ).toThrow("ANALYTICS_RETENTION_DAYS_INVALID");
  });
});
