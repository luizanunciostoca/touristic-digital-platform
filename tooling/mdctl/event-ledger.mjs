import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";

export const EVENT_TYPES = new Set([
  "CHANGESET_CREATED",
  "CHANGESET_CANCELLED",
  "CLAIM_ACQUIRED",
  "CLAIM_RENEWED",
  "CLAIM_RELEASED",
  "CLAIM_EXPIRED",
  "CANDIDATE_COMPOSED",
  "EVIDENCE_ACCEPTED",
  "EVIDENCE_REJECTED",
  "MERGED",
  "ARTIFACT_BUILT",
  "RELEASE_CERTIFIED",
  "STAGING_PROMOTED",
  "STAGING_ACCEPTED",
  "PRODUCTION_PROMOTED",
  "PRODUCTION_ACCEPTED",
  "ROLLBACK",
  "INCIDENT_CREATED",
]);

const SHA = /^[0-9a-f]{40}$/u;
const EVENT_ID = /^evt-[A-Za-z0-9._-]{1,120}$/u;

export function validateAuthorityEvent(event) {
  assert.equal(event?.schemaVersion, 1, "EVENT_SCHEMA_VERSION_INVALID");
  assert.match(event?.eventId ?? "", EVENT_ID, "EVENT_ID_INVALID");
  assert.ok(EVENT_TYPES.has(event?.eventType), "EVENT_TYPE_INVALID");
  assert.ok(Number.isFinite(Date.parse(event?.observedAt)), "EVENT_TIME_INVALID");
  assert.equal(typeof event?.actor, "string", "EVENT_ACTOR_INVALID");
  assert.ok(
    event.actor.length > 0 && event.actor.length <= 120,
    "EVENT_ACTOR_INVALID",
  );
  assert.equal(typeof event?.entity, "string", "EVENT_ENTITY_INVALID");
  assert.ok(
    event.entity.length > 0 && event.entity.length <= 160,
    "EVENT_ENTITY_INVALID",
  );
  if (event.sourceSha != null)
    assert.match(event.sourceSha, SHA, "EVENT_SOURCE_SHA_INVALID");
  assert.ok(
    Number.isInteger(event?.payloadVersion) && event.payloadVersion >= 1,
    "EVENT_PAYLOAD_VERSION_INVALID",
  );
  assert.ok(
    event?.payload &&
      typeof event.payload === "object" &&
      !Array.isArray(event.payload),
    "EVENT_PAYLOAD_INVALID",
  );
  return event;
}

export function parseAuthorityLedger(text) {
  const events = String(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => validateAuthorityEvent(JSON.parse(line)));
  const ids = events.map((event) => event.eventId);
  assert.equal(new Set(ids).size, ids.length, "EVENT_ID_DUPLICATE");
  return events;
}

export function authorityLedgerDigest(text) {
  parseAuthorityLedger(text);
  return "sha256:" + createHash("sha256").update(text).digest("hex");
}

export async function appendAuthorityEvent(path, event) {
  validateAuthorityEvent(event);
  let existing = "";
  try {
    existing = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const events = parseAuthorityLedger(existing);
  assert.equal(
    events.some((item) => item.eventId === event.eventId),
    false,
    "EVENT_ID_DUPLICATE",
  );
  await appendFile(path, JSON.stringify(event) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  return event;
}
