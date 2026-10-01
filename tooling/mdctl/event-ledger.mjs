import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";

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
  "LEASE_ACQUIRED",
  "LEASE_RENEWED",
  "LEASE_RELEASED",
  "CONTEXT_PACK_CREATED",
  "TASK_STARTED",
  "TASK_TESTED",
  "TASK_SUBMITTED",
]);

const SHA = /^[0-9a-f]{40}$/u;
const EVENT_ID = /^evt-[A-Za-z0-9._-]{1,120}$/u;
const EVENT_KEYS = new Set([
  "schemaVersion",
  "eventId",
  "eventType",
  "observedAt",
  "actor",
  "entity",
  "sourceSha",
  "payloadVersion",
  "payload",
]);
const LOCK_WAIT_MS = 25;
const LOCK_TIMEOUT_MS = 5_000;
const LOCK_STALE_MS = 120_000;

export function validateAuthorityEvent(event) {
  assert.ok(
    event && typeof event === "object" && !Array.isArray(event),
    "EVENT_OBJECT_INVALID",
  );
  for (const key of Object.keys(event)) {
    assert.ok(EVENT_KEYS.has(key), "EVENT_PROPERTY_UNKNOWN:" + key);
  }
  assert.equal(event.schemaVersion, 1, "EVENT_SCHEMA_VERSION_INVALID");
  assert.match(event.eventId ?? "", EVENT_ID, "EVENT_ID_INVALID");
  assert.ok(EVENT_TYPES.has(event.eventType), "EVENT_TYPE_INVALID");
  assert.ok(
    Number.isFinite(Date.parse(event.observedAt)),
    "EVENT_TIME_INVALID",
  );
  assert.equal(typeof event.actor, "string", "EVENT_ACTOR_INVALID");
  assert.ok(
    event.actor.length > 0 && event.actor.length <= 120,
    "EVENT_ACTOR_INVALID",
  );
  assert.equal(typeof event.entity, "string", "EVENT_ENTITY_INVALID");
  assert.ok(
    event.entity.length > 0 && event.entity.length <= 160,
    "EVENT_ENTITY_INVALID",
  );
  if (event.sourceSha != null)
    assert.match(event.sourceSha, SHA, "EVENT_SOURCE_SHA_INVALID");
  assert.ok(
    Number.isInteger(event.payloadVersion) && event.payloadVersion >= 1,
    "EVENT_PAYLOAD_VERSION_INVALID",
  );
  assert.ok(
    event.payload &&
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const lockOwnerPath = (lockPath) => lockPath + "/owner";

async function createOwnedLock(lockPath, ownerToken) {
  await mkdir(lockPath, { mode: 0o700 });
  try {
    await writeFile(lockOwnerPath(lockPath), ownerToken + "\n", {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
  } catch (error) {
    await rm(lockPath, { recursive: true, force: true });
    throw error;
  }
}

async function releaseOwnedLock(lockPath, ownerToken) {
  try {
    const observedOwner = (await readFile(lockOwnerPath(lockPath), "utf8")).trim();
    if (observedOwner !== ownerToken) return false;
    await rm(lockPath, { recursive: true, force: true });
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function withLedgerLock(path, operation) {
  const lockPath = path + ".lock";
  const takeoverPath = lockPath + ".takeover";
  const ownerToken = randomUUID();
  const startedAt = Date.now();
  let acquired = false;

  const timedOut = () => Date.now() - startedAt >= LOCK_TIMEOUT_MS;
  const wait = async () => {
    if (timedOut()) throw new Error("EVENT_LEDGER_LOCK_TIMEOUT");
    await sleep(LOCK_WAIT_MS);
  };

  for (;;) {
    try {
      await stat(takeoverPath);
      await wait();
      continue;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }

    try {
      await createOwnedLock(lockPath, ownerToken);
      acquired = true;
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }

    let info;
    try {
      info = await stat(lockPath);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }

    if (Date.now() - info.mtimeMs <= LOCK_STALE_MS) {
      await wait();
      continue;
    }

    try {
      await mkdir(takeoverPath, { mode: 0o700 });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      await wait();
      continue;
    }

    try {
      let current;
      try {
        current = await stat(lockPath);
      } catch (error) {
        if (error?.code === "ENOENT") continue;
        throw error;
      }

      if (Date.now() - current.mtimeMs <= LOCK_STALE_MS) continue;

      await rm(lockPath, { recursive: true, force: true });

      try {
        await createOwnedLock(lockPath, ownerToken);
        acquired = true;
        break;
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
      }
    } finally {
      await rm(takeoverPath, { recursive: true, force: true });
    }

    if (!acquired) await wait();
  }

  try {
    return await operation();
  } finally {
    if (acquired) await releaseOwnedLock(lockPath, ownerToken);
  }
}

export async function appendAuthorityEvent(path, event) {
  validateAuthorityEvent(event);
  return withLedgerLock(path, async () => {
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

    const separator =
      existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
    await appendFile(path, separator + JSON.stringify(event) + "\n", {
      encoding: "utf8",
      mode: 0o600,
    });
    return event;
  });
}
