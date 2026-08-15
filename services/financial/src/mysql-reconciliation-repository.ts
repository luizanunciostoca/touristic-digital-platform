import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import {
  normalizePaymentId,
  normalizeReconciliationFinding,
  normalizeReconciliationFindingDraft,
  normalizeReconciliationFindingId,
  normalizeReconciliationRun,
  type FinancialReconciliationRepositoryPort,
  type PaymentId,
  type ReconciliationFinding,
  type ReconciliationFindingDraft,
  type ReconciliationFindingId,
  type ReconciliationRecordResult,
  type ReconciliationRun,
} from "@touristic/financial";

interface ReconciliationRunRow extends RowDataPacket {
  reconciliation_run_id: string;
  payment_id: string;
  snapshot_hash: Buffer;
  observed_at: Date | string;
  recorded_at: Date | string;
  finding_count: number;
}

interface ReconciliationFindingRow extends RowDataPacket {
  reconciliation_finding_id: string;
  payment_id: string;
  kind: string;
  severity: string;
  evidence_hash: Buffer;
  expected_value: string;
  observed_value: string;
  state: string;
  first_seen_at: Date | string;
  last_seen_at: Date | string;
  acknowledged_at: Date | string | null;
  acknowledged_by: string | null;
  resolved_at: Date | string | null;
}

const runColumns = `
  reconciliation_run_id, payment_id, snapshot_hash,
  observed_at, recorded_at, finding_count
`;
const findingColumns = `
  reconciliation_finding_id, payment_id, kind, severity, evidence_hash,
  expected_value, observed_value, state, first_seen_at, last_seen_at,
  acknowledged_at, acknowledged_by, resolved_at
`;
const findingSelectColumns = `
  f.reconciliation_finding_id, f.payment_id, f.kind, f.severity,
  f.evidence_hash, f.expected_value, f.observed_value, f.state,
  f.first_seen_at, f.last_seen_at, f.acknowledged_at,
  f.acknowledged_by, f.resolved_at
`;

function timestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("FINANCIAL_INVALID_DB_TIMESTAMP");
  }
  return date.toISOString();
}

function optionalTimestamp(value: Date | string | null): string | null {
  return value === null ? null : timestamp(value);
}

function runFromRow(row: ReconciliationRunRow): ReconciliationRun {
  const run = normalizeReconciliationRun({
    id: row.reconciliation_run_id,
    paymentId: row.payment_id,
    snapshotHash: row.snapshot_hash.toString("hex"),
    observedAt: timestamp(row.observed_at),
    recordedAt: timestamp(row.recorded_at),
    findingCount: Number(row.finding_count),
  });
  if (!run) throw new Error("FINANCIAL_INVALID_RECONCILIATION_RUN");
  return run;
}

function findingFromRow(row: ReconciliationFindingRow): ReconciliationFinding {
  const finding = normalizeReconciliationFinding({
    id: row.reconciliation_finding_id,
    paymentId: row.payment_id,
    kind: row.kind,
    severity: row.severity,
    evidenceHash: row.evidence_hash.toString("hex"),
    expected: row.expected_value,
    observed: row.observed_value,
    state: row.state,
    firstSeenAt: timestamp(row.first_seen_at),
    lastSeenAt: timestamp(row.last_seen_at),
    acknowledgedAt: optionalTimestamp(row.acknowledged_at),
    acknowledgedBy: row.acknowledged_by,
    resolvedAt: optionalTimestamp(row.resolved_at),
  });
  if (!finding) throw new Error("FINANCIAL_INVALID_RECONCILIATION_FINDING");
  return finding;
}

function sameRun(left: ReconciliationRun, right: ReconciliationRun): boolean {
  return (
    left.id === right.id &&
    left.paymentId === right.paymentId &&
    left.snapshotHash === right.snapshotHash &&
    left.findingCount === right.findingCount
  );
}

function sameFinding(
  left: ReconciliationFinding,
  right: ReconciliationFindingDraft,
): boolean {
  return (
    left.id === right.id &&
    left.paymentId === right.paymentId &&
    left.kind === right.kind &&
    left.severity === right.severity &&
    left.evidenceHash === right.evidenceHash &&
    left.expected === right.expected &&
    left.observed === right.observed
  );
}

async function findRun(
  connection: PoolConnection,
  runId: ReconciliationRun["id"],
): Promise<ReconciliationRun | null> {
  const [rows] = await connection.execute<ReconciliationRunRow[]>(
    `SELECT ${runColumns}
     FROM financial_reconciliation_runs
     WHERE reconciliation_run_id = ?
     LIMIT 1`,
    [runId],
  );
  return rows[0] ? runFromRow(rows[0]) : null;
}

async function findFinding(
  connection: PoolConnection,
  findingId: ReconciliationFindingId,
): Promise<ReconciliationFinding | null> {
  const [rows] = await connection.execute<ReconciliationFindingRow[]>(
    `SELECT ${findingColumns}
     FROM financial_reconciliation_findings
     WHERE reconciliation_finding_id = ?
     LIMIT 1`,
    [findingId],
  );
  return rows[0] ? findingFromRow(rows[0]) : null;
}

async function findingsForRun(
  connection: PoolConnection,
  runId: ReconciliationRun["id"],
): Promise<readonly ReconciliationFinding[]> {
  const [rows] = await connection.execute<ReconciliationFindingRow[]>(
    `SELECT ${findingSelectColumns}
     FROM financial_reconciliation_findings f
     INNER JOIN financial_reconciliation_run_findings rf
       ON rf.reconciliation_finding_id = f.reconciliation_finding_id
     WHERE rf.reconciliation_run_id = ?
     ORDER BY f.kind, f.reconciliation_finding_id`,
    [runId],
  );
  return Object.freeze(rows.map(findingFromRow));
}

export class MySqlFinancialReconciliationRepository implements FinancialReconciliationRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async record(input: {
    readonly run: ReconciliationRun;
    readonly findings: readonly ReconciliationFindingDraft[];
  }): Promise<ReconciliationRecordResult> {
    const run = normalizeReconciliationRun(input.run);
    const findings = input.findings.map(normalizeReconciliationFindingDraft);
    if (
      !run ||
      findings.some((value) => value === null) ||
      findings.length !== run.findingCount ||
      new Set(findings.map((value) => value?.id)).size !== findings.length ||
      findings.some((value) => value?.paymentId !== run.paymentId)
    ) {
      throw new Error("FINANCIAL_INVALID_RECONCILIATION_RECORD");
    }
    const normalized = findings as ReconciliationFindingDraft[];
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [payments] = await connection.execute<RowDataPacket[]>(
        `SELECT payment_id
         FROM financial_payments
         WHERE payment_id = ?
         FOR UPDATE`,
        [run.paymentId],
      );
      if (!payments[0]) {
        throw new Error("FINANCIAL_RECONCILIATION_PAYMENT_NOT_FOUND");
      }

      const existingRun = await findRun(connection, run.id);
      if (existingRun) {
        if (!sameRun(existingRun, run)) {
          throw new Error("FINANCIAL_RECONCILIATION_RUN_CONFLICT");
        }
        const persistedFindings = await findingsForRun(connection, run.id);
        if (
          persistedFindings.length !== normalized.length ||
          normalized.some(
            (draft) =>
              !persistedFindings.some((value) => sameFinding(value, draft)),
          )
        ) {
          throw new Error("FINANCIAL_RECONCILIATION_REPLAY_CONFLICT");
        }
        await connection.commit();
        return Object.freeze({
          run: existingRun,
          findings: persistedFindings,
          replayed: true,
        });
      }

      await connection.execute<ResultSetHeader>(
        `INSERT INTO financial_reconciliation_runs (
           reconciliation_run_id, payment_id, snapshot_hash,
           observed_at, recorded_at, finding_count
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          run.id,
          run.paymentId,
          Buffer.from(run.snapshotHash, "hex"),
          new Date(run.observedAt),
          new Date(run.recordedAt),
          run.findingCount,
        ],
      );

      const activeIds: string[] = [];
      for (const draft of normalized) {
        await connection.execute<ResultSetHeader>(
          `INSERT IGNORE INTO financial_reconciliation_findings (
             reconciliation_finding_id, payment_id, kind, severity,
             evidence_hash, expected_value, observed_value, state,
             first_seen_at, last_seen_at,
             acknowledged_at, acknowledged_by, resolved_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, NULL, NULL, NULL)`,
          [
            draft.id,
            draft.paymentId,
            draft.kind,
            draft.severity,
            Buffer.from(draft.evidenceHash, "hex"),
            draft.expected,
            draft.observed,
            new Date(run.recordedAt),
            new Date(run.recordedAt),
          ],
        );
        const persisted = await findFinding(connection, draft.id);
        if (!persisted || !sameFinding(persisted, draft)) {
          throw new Error("FINANCIAL_RECONCILIATION_FINDING_CONFLICT");
        }
        await connection.execute<ResultSetHeader>(
          `UPDATE financial_reconciliation_findings
           SET last_seen_at = GREATEST(last_seen_at, ?),
               acknowledged_at = IF(state = 'resolved', NULL, acknowledged_at),
               acknowledged_by = IF(state = 'resolved', NULL, acknowledged_by),
               state = IF(state = 'resolved', 'open', state),
               resolved_at = NULL
           WHERE reconciliation_finding_id = ?`,
          [new Date(run.recordedAt), draft.id],
        );
        await connection.execute<ResultSetHeader>(
          `INSERT INTO financial_reconciliation_run_findings (
             reconciliation_run_id, reconciliation_finding_id
           ) VALUES (?, ?)`,
          [run.id, draft.id],
        );
        activeIds.push(draft.id);
      }

      if (activeIds.length === 0) {
        await connection.execute<ResultSetHeader>(
          `UPDATE financial_reconciliation_findings
           SET state = 'resolved',
               resolved_at = GREATEST(first_seen_at, ?)
           WHERE payment_id = ?
             AND state <> 'resolved'`,
          [new Date(run.recordedAt), run.paymentId],
        );
      } else {
        const placeholders = activeIds.map(() => "?").join(", ");
        await connection.execute<ResultSetHeader>(
          `UPDATE financial_reconciliation_findings
           SET state = 'resolved',
               resolved_at = GREATEST(first_seen_at, ?)
           WHERE payment_id = ?
             AND state <> 'resolved'
             AND reconciliation_finding_id NOT IN (${placeholders})`,
          [new Date(run.recordedAt), run.paymentId, ...activeIds],
        );
      }

      const persistedFindings = await findingsForRun(connection, run.id);
      if (
        persistedFindings.length !== normalized.length ||
        normalized.some(
          (draft) =>
            !persistedFindings.some((value) => sameFinding(value, draft)),
        )
      ) {
        throw new Error("FINANCIAL_RECONCILIATION_WRITE_INCOMPLETE");
      }
      await connection.commit();
      return Object.freeze({
        run,
        findings: persistedFindings,
        replayed: false,
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async listOpen(
    paymentIdInput: PaymentId,
  ): Promise<readonly ReconciliationFinding[]> {
    const paymentId = normalizePaymentId(paymentIdInput);
    if (!paymentId) throw new Error("FINANCIAL_INVALID_PAYMENT_ID");
    const [rows] = await this.pool.execute<ReconciliationFindingRow[]>(
      `SELECT ${findingColumns}
       FROM financial_reconciliation_findings
       WHERE payment_id = ?
         AND state <> 'resolved'
       ORDER BY severity DESC, first_seen_at, reconciliation_finding_id`,
      [paymentId],
    );
    return Object.freeze(rows.map(findingFromRow));
  }

  async acknowledge(
    findingIdInput: ReconciliationFindingId,
    actorSubject: string,
    acknowledgedAt: string,
  ): Promise<ReconciliationFinding> {
    const findingId = normalizeReconciliationFindingId(findingIdInput);
    const actor = actorSubject.trim();
    const proposedAt = new Date(acknowledgedAt);
    if (
      !findingId ||
      !actor ||
      actor.length > 200 ||
      !Number.isFinite(proposedAt.getTime())
    ) {
      throw new Error("FINANCIAL_INVALID_RECONCILIATION_ACKNOWLEDGEMENT");
    }
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<ReconciliationFindingRow[]>(
        `SELECT ${findingColumns}
         FROM financial_reconciliation_findings
         WHERE reconciliation_finding_id = ?
         FOR UPDATE`,
        [findingId],
      );
      const existing = rows[0] ? findingFromRow(rows[0]) : null;
      if (!existing) {
        throw new Error("FINANCIAL_RECONCILIATION_FINDING_NOT_FOUND");
      }
      if (existing.state === "resolved") {
        throw new Error("FINANCIAL_RECONCILIATION_FINDING_RESOLVED");
      }
      if (existing.state === "open") {
        await connection.execute<ResultSetHeader>(
          `UPDATE financial_reconciliation_findings
           SET state = 'acknowledged',
               acknowledged_at = ?,
               acknowledged_by = ?
           WHERE reconciliation_finding_id = ?
             AND state = 'open'`,
          [proposedAt, actor, findingId],
        );
      }
      const saved = await findFinding(connection, findingId);
      if (!saved || saved.state !== "acknowledged") {
        throw new Error("FINANCIAL_RECONCILIATION_ACKNOWLEDGEMENT_FAILED");
      }
      await connection.commit();
      return saved;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
