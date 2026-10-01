import assert from "node:assert/strict";
import test from "node:test";
import {
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

test("duplicate event IDs fail closed", () => {
  const line = JSON.stringify(event);
  assert.throws(
    () => parseAuthorityLedger(line + "\n" + line + "\n"),
    /EVENT_ID_DUPLICATE/u,
  );
});
