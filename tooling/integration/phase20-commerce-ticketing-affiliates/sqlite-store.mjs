import { DatabaseSync } from "node:sqlite";

function parseJson(value) {
  if (value === null || value === undefined) return null;
  return JSON.parse(String(value));
}

function prepFromRow(row) {
  if (!row) return null;
  return {
    id: row.preparation_id,
    contractId: row.contract_id,
    action: row.action_name,
    subject: row.actor_subject,
    authzVersion: Number(row.authz_version),
    tenantId: row.tenant_id,
    destinationId: row.destination_id,
    businessId: row.business_id,
    payload: parseJson(row.payload_json),
    semanticDigest: row.semantic_digest,
    status: row.status,
    createdAt: Number(row.created_at_ms),
    expiresAt: Number(row.expires_at_ms),
    confirmedAt:
      row.confirmed_at_ms === null ? null : Number(row.confirmed_at_ms),
    cancelledAt:
      row.cancelled_at_ms === null ? null : Number(row.cancelled_at_ms),
  };
}

function claimFromRow(row, newlyClaimed = false) {
  if (!row) return null;
  return {
    semanticDigest: row.semantic_digest,
    status: row.status,
    result: parseJson(row.result_json),
    preparationId: row.preparation_id,
    claimedAt: Number(row.claimed_at_ms),
    executedAt: row.executed_at_ms === null ? null : Number(row.executed_at_ms),
    newlyClaimed,
  };
}

export class SqliteLaneCMutationStore {
  constructor(filename) {
    if (typeof filename !== "string" || !filename)
      throw new Error("LANE_C_SQLITE_PATH_REQUIRED");
    this.db = new DatabaseSync(filename);
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000;",
    );
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS phase20_lane_c_preparations (
        preparation_id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL,
        action_name TEXT NOT NULL,
        actor_subject TEXT NOT NULL,
        authz_version INTEGER NOT NULL,
        tenant_id TEXT NOT NULL,
        destination_id TEXT NOT NULL,
        business_id TEXT NULL,
        payload_json TEXT NOT NULL,
        semantic_digest TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('prepared','confirmed','executed','cancelled')),
        created_at_ms INTEGER NOT NULL,
        expires_at_ms INTEGER NOT NULL,
        confirmed_at_ms INTEGER NULL,
        cancelled_at_ms INTEGER NULL
      );
      CREATE INDEX IF NOT EXISTS idx_phase20_lane_c_scope
        ON phase20_lane_c_preparations(contract_id, tenant_id, actor_subject, destination_id, business_id);
      CREATE INDEX IF NOT EXISTS idx_phase20_lane_c_expiry
        ON phase20_lane_c_preparations(status, expires_at_ms);
      CREATE TABLE IF NOT EXISTS phase20_lane_c_execution_claims (
        claim_key TEXT PRIMARY KEY,
        semantic_digest TEXT NOT NULL,
        preparation_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('claimed','executed')),
        result_json TEXT NULL,
        claimed_at_ms INTEGER NOT NULL,
        executed_at_ms INTEGER NULL,
        FOREIGN KEY(preparation_id) REFERENCES phase20_lane_c_preparations(preparation_id)
          ON DELETE RESTRICT ON UPDATE RESTRICT
      );
    `);
  }

  close() {
    this.db.close();
  }

  async createPreparation(record) {
    this.db
      .prepare(
        `
      INSERT INTO phase20_lane_c_preparations (
        preparation_id, contract_id, action_name, actor_subject, authz_version,
        tenant_id, destination_id, business_id, payload_json, semantic_digest,
        status, created_at_ms, expires_at_ms, confirmed_at_ms, cancelled_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        record.id,
        record.contractId,
        record.action,
        record.subject,
        record.authzVersion,
        record.tenantId,
        record.destinationId,
        record.businessId,
        JSON.stringify(record.payload),
        record.semanticDigest,
        record.status,
        record.createdAt,
        record.expiresAt,
        record.confirmedAt,
        record.cancelledAt,
      );
    return record;
  }

  async loadPreparation(id) {
    return prepFromRow(
      this.db
        .prepare(
          "SELECT * FROM phase20_lane_c_preparations WHERE preparation_id = ? LIMIT 1",
        )
        .get(id),
    );
  }

  async transitionPreparation(id, expectedStatus, patch) {
    const current = await this.loadPreparation(id);
    if (!current) throw new Error("PREPARATION_NOT_FOUND");
    const next = { ...current, ...patch };
    const result = this.db
      .prepare(
        `
      UPDATE phase20_lane_c_preparations
      SET status = ?, confirmed_at_ms = ?, cancelled_at_ms = ?
      WHERE preparation_id = ? AND status = ?
    `,
      )
      .run(next.status, next.confirmedAt, next.cancelledAt, id, expectedStatus);
    if (Number(result.changes) !== 1) throw new Error("STALE_STATE");
    return next;
  }

  async loadExecution(key) {
    return claimFromRow(
      this.db
        .prepare(
          "SELECT * FROM phase20_lane_c_execution_claims WHERE claim_key = ? LIMIT 1",
        )
        .get(key),
    );
  }

  async claimExecution(key, semanticDigest, metadata) {
    const inserted = this.db
      .prepare(
        `
      INSERT OR IGNORE INTO phase20_lane_c_execution_claims (
        claim_key, semantic_digest, preparation_id, status, result_json, claimed_at_ms, executed_at_ms
      ) VALUES (?, ?, ?, 'claimed', NULL, ?, NULL)
    `,
      )
      .run(key, semanticDigest, metadata.preparationId, metadata.claimedAt);

    const row = this.db
      .prepare(
        "SELECT * FROM phase20_lane_c_execution_claims WHERE claim_key = ? LIMIT 1",
      )
      .get(key);
    if (!row) throw new Error("IDEMPOTENCY_CLAIM_MISSING");
    if (row.semantic_digest !== semanticDigest)
      throw new Error("IDEMPOTENCY_CONFLICT");
    return claimFromRow(row, Number(inserted.changes) === 1);
  }

  async completeExecution(key, result, executedAt) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.db
        .prepare(
          "SELECT * FROM phase20_lane_c_execution_claims WHERE claim_key = ? LIMIT 1",
        )
        .get(key);
      if (!current) throw new Error("IDEMPOTENCY_CLAIM_MISSING");
      if (current.status === "executed") {
        this.db.exec("COMMIT");
        return claimFromRow(current);
      }
      const updated = this.db
        .prepare(
          `
        UPDATE phase20_lane_c_execution_claims
        SET status = 'executed', result_json = ?, executed_at_ms = ?
        WHERE claim_key = ? AND status = 'claimed'
      `,
        )
        .run(JSON.stringify(result), executedAt, key);
      if (Number(updated.changes) !== 1)
        throw new Error("IDEMPOTENCY_STALE_STATE");
      const row = this.db
        .prepare(
          "SELECT * FROM phase20_lane_c_execution_claims WHERE claim_key = ? LIMIT 1",
        )
        .get(key);
      this.db.exec("COMMIT");
      return claimFromRow(row);
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      throw error;
    }
  }
}
