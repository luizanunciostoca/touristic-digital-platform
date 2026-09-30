import { describe, expect, it } from "vitest";

import {
  claimConsumerEvent,
  claimOutboxEvent,
  createOutboxEvent,
  growthEventFabricSchemaSql,
  markOutboxDelivered,
  markOutboxFailure,
} from "./index.js";

const policy = {
  maximumAttempts: 3,
  baseDelaySeconds: 10,
  maximumDelaySeconds: 60,
  leaseSeconds: 30,
};

function event() {
  return createOutboxEvent({
    eventId: "event_00000001",
    eventType: "MissionCompleted",
    aggregateType: "mission_progress",
    aggregateId: "progress_00000001",
    contractVersion: 1,
    payload: { missionId: "mission_1" },
    correlationId: "corr_00000001",
    causationId: null,
    availableAt: "2026-09-30T12:00:00.000Z",
  });
}

describe("event fabric and outbox", () => {
  it("leases an available event and prevents concurrent ownership", () => {
    const claimed = claimOutboxEvent(event(), {
      workerId: "worker_a",
      occurredAt: "2026-09-30T12:00:00.000Z",
      policy,
    });
    expect(claimed?.status).toBe("dispatching");

    const concurrent = claimOutboxEvent(claimed as NonNullable<typeof claimed>, {
      workerId: "worker_b",
      occurredAt: "2026-09-30T12:00:05.000Z",
      policy,
    });
    expect(concurrent).toBeNull();
  });

  it("marks success exactly once for the lease owner", () => {
    const claimed = claimOutboxEvent(event(), {
      workerId: "worker_a",
      occurredAt: "2026-09-30T12:00:00.000Z",
      policy,
    });
    if (!claimed) throw new Error("OUTBOX_CLAIM_FAILED");

    const delivered = markOutboxDelivered(
      claimed,
      "worker_a",
      "2026-09-30T12:00:01.000Z",
    );
    expect(delivered.status).toBe("delivered");
    expect(markOutboxDelivered(delivered, "worker_a", delivered.deliveredAt!)).toBe(
      delivered,
    );
  });

  it("retries with backoff then enters dead-letter state", () => {
    let current = event();

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const claimed = claimOutboxEvent(current, {
        workerId: "worker_a",
        occurredAt:
          attempt === 1
            ? "2026-09-30T12:00:00.000Z"
            : current.availableAt,
        policy,
      });
      if (!claimed) throw new Error("OUTBOX_CLAIM_FAILED");

      current = markOutboxFailure(claimed, {
        workerId: "worker_a",
        occurredAt:
          attempt === 1
            ? "2026-09-30T12:00:00.000Z"
            : current.availableAt,
        errorCode: "DOWNSTREAM_UNAVAILABLE",
        policy,
      });
    }

    expect(current.status).toBe("dead_letter");
    expect(current.attempts).toBe(3);
  });

  it("deduplicates consumer replay and rejects digest conflicts", () => {
    const first = claimConsumerEvent(
      {
        consumerName: "mission-projection",
        eventId: "event_00000001",
        semanticDigest: "a".repeat(64),
        claimedAt: "2026-09-30T12:00:00.000Z",
      },
      null,
    );
    expect(first.kind).toBe("claimed");

    const claim = first.claim;
    expect(
      claimConsumerEvent(
        {
          consumerName: claim.consumerName,
          eventId: claim.eventId,
          semanticDigest: claim.semanticDigest,
          claimedAt: "2026-09-30T12:01:00.000Z",
        },
        claim,
      ).kind,
    ).toBe("replayed");

    expect(
      claimConsumerEvent(
        {
          consumerName: claim.consumerName,
          eventId: claim.eventId,
          semanticDigest: "b".repeat(64),
          claimedAt: "2026-09-30T12:01:00.000Z",
        },
        claim,
      ).kind,
    ).toBe("conflict");
  });

  it("defines additive MySQL tables with durable dedup keys", () => {
    expect(growthEventFabricSchemaSql).toContain(
      "CREATE TABLE IF NOT EXISTS growth_outbox_events",
    );
    expect(growthEventFabricSchemaSql).toContain(
      "PRIMARY KEY (consumer_name, event_id)",
    );
    expect(growthEventFabricSchemaSql).not.toContain("DROP TABLE");
    expect(growthEventFabricSchemaSql).not.toContain("ALTER TABLE");
  });
});
