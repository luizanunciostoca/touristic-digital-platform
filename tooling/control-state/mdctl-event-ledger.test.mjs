import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  appendAuthorityEvent,
  authorityLedgerDigest,
  parseAuthorityLedger,
  validateAuthorityEvent,
} from "../mdctl/event-ledger.mjs";

const event = {
  schemaVersion: 1,
  eventId: "evt-test-001",
  eventType: "CLAIM_ACQUIRED",
  observedAt: "2026-10-01T00:00:00Z",
  actor: "test",
  entity: "MD-TEST",
  sourceSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  payloadVersion: 1,
  payload: { lease: "test" },
};

test("authority event validates and ledger digest is stable", () => {
  assert.equal(validateAuthorityEvent(event), event);
  const text = JSON.stringify(event) + "\n";
  assert.deepEqual(parseAuthorityLedger(text), [event]);
  assert.match(authorityLedgerDigest(text), /^sha256:[0-9a-f]{64}$/u);
});

test("unknown event properties fail closed", () => {
  assert.throws(
    () => validateAuthorityEvent({ ...event, unexpected: true }),
    /EVENT_PROPERTY_UNKNOWN/u,
  );
});

test("duplicate event IDs fail closed", () => {
  const line = JSON.stringify(event);
  assert.throws(
    () => parseAuthorityLedger(line + "\n" + line + "\n"),
    /EVENT_ID_DUPLICATE/u,
  );
});

test("append inserts a separator after an unterminated record", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tdp-ledger-"));
  const path = join(directory, "events.ndjson");
  const second = { ...event, eventId: "evt-test-002" };
  try {
    await writeFile(path, JSON.stringify(event), "utf8");
    await appendAuthorityEvent(path, second);
    const stored = await readFile(path, "utf8");
    assert.deepEqual(
      parseAuthorityLedger(stored).map((item) => item.eventId),
      ["evt-test-001", "evt-test-002"],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("concurrent duplicate appends serialize and preserve one event", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tdp-ledger-"));
  const path = join(directory, "events.ndjson");
  try {
    const attempts = await Promise.allSettled([
      appendAuthorityEvent(path, event),
      appendAuthorityEvent(path, event),
    ]);
    assert.equal(
      attempts.filter((item) => item.status === "fulfilled").length,
      1,
    );
    assert.equal(
      attempts.filter((item) => item.status === "rejected").length,
      1,
    );
    const stored = await readFile(path, "utf8");
    assert.deepEqual(parseAuthorityLedger(stored), [event]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("lease and Context Pack authority events are executable", () => {
  for (const [index, eventType] of [
    "LEASE_ACQUIRED",
    "LEASE_RENEWED",
    "LEASE_RELEASED",
    "CONTEXT_PACK_CREATED",
  ].entries()) {
    const candidate = {
      ...event,
      eventId: "evt-b2a-" + index,
      eventType,
    };
    assert.equal(validateAuthorityEvent(candidate), candidate);
  }
});

test("tracked authority ledger satisfies the executable envelope", async () => {
  const path = new URL(
    "../../.github/morro-control/events.ndjson",
    import.meta.url,
  );
  const stored = await readFile(path, "utf8");
  assert.ok(parseAuthorityLedger(stored).length > 0);
});
