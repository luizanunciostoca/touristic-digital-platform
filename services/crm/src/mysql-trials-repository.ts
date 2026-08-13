import type { CrmId, CrmTrial } from "@touristic/crm";
import type {
  CrmTrialBoundaryRepository,
  CrmTrialCreateRecord,
} from "@touristic/crm/trials-boundary";
import type { CrmTrialNotificationRepository } from "@touristic/crm/trials-notification";
import type { CrmTrialSchedulerRepository } from "@touristic/crm/trials-scheduler";
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

interface TrialRow extends RowDataPacket {
  id: number;
  lead_id: number;
  start_date: Date;
  end_date: Date;
  duration_days: number;
  status: CrmTrial["status"];
  converted_at: Date | null;
  notified_at: Date | null;
  schedule_cron_task_uid: string | null;
  created_at: Date;
  updated_at: Date;
}

const trialColumns =
  "id, lead_id, start_date, end_date, duration_days, status, converted_at, notified_at, schedule_cron_task_uid, created_at, updated_at";

function mapTrial(row: TrialRow): CrmTrial {
  return {
    id: row.id,
    leadId: row.lead_id,
    startDate: row.start_date,
    endDate: row.end_date,
    durationDays: row.duration_days,
    status: row.status,
    convertedAt: row.converted_at,
    notifiedAt: row.notified_at,
    scheduleCronTaskUid: row.schedule_cron_task_uid,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class MySqlCrmTrialRepository
  implements
    CrmTrialBoundaryRepository,
    CrmTrialSchedulerRepository,
    CrmTrialNotificationRepository
{
  constructor(private readonly pool: Pool) {}

  async list(leadId?: CrmId): Promise<readonly CrmTrial[]> {
    const [rows] = leadId
      ? await this.pool.execute<TrialRow[]>(
          `SELECT ${trialColumns} FROM crm_trials WHERE lead_id = ? ORDER BY created_at DESC, id DESC`,
          [leadId],
        )
      : await this.pool.execute<TrialRow[]>(
          `SELECT ${trialColumns} FROM crm_trials ORDER BY created_at DESC, id DESC`,
        );
    return rows.map(mapTrial);
  }

  async listDue(): Promise<readonly CrmTrial[]> {
    const [rows] = await this.pool.execute<TrialRow[]>(
      `SELECT ${trialColumns} FROM crm_trials WHERE status = 'active' AND end_date <= CURRENT_TIMESTAMP(3) AND schedule_cron_task_uid IS NULL ORDER BY end_date ASC, id ASC`,
    );
    return rows.map(mapTrial);
  }

  async listExpiredUnnotified(staleBefore: Date): Promise<readonly CrmTrial[]> {
    const [rows] = await this.pool.execute<TrialRow[]>(
      `SELECT ${trialColumns} FROM crm_trials WHERE status = 'expired' AND notified_at IS NULL AND (notification_task_uid IS NULL OR notification_claimed_at IS NULL OR notification_claimed_at <= ?) ORDER BY end_date ASC, id ASC`,
      [staleBefore],
    );
    return rows.map(mapTrial);
  }

  async findById(id: CrmId): Promise<CrmTrial | null> {
    const [rows] = await this.pool.execute<TrialRow[]>(
      `SELECT ${trialColumns} FROM crm_trials WHERE id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ? mapTrial(rows[0]) : null;
  }

  async leadExists(leadId: CrmId): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT id FROM crm_leads WHERE id = ? LIMIT 1",
      [leadId],
    );
    return rows.length > 0;
  }

  async create(record: CrmTrialCreateRecord): Promise<CrmTrial> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "INSERT INTO crm_trials (lead_id, start_date, end_date, duration_days, status) VALUES (?, ?, ?, ?, ?)",
      [
        record.leadId,
        record.startDate,
        record.endDate,
        record.durationDays,
        record.status,
      ],
    );
    const created = await this.findById(result.insertId);
    if (!created) throw new Error("crm_trial_create_readback_failed");
    return created;
  }

  async markConverted(id: CrmId, convertedAt: Date): Promise<CrmTrial> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "UPDATE crm_trials SET status = 'converted', converted_at = ? WHERE id = ? AND status = 'active'",
      [convertedAt, id],
    );
    if (result.affectedRows !== 1)
      throw new Error("crm_trial_mark_converted_conflict");
    return this.readBack(id, "crm_trial_mark_converted_readback_failed");
  }

  async markCancelled(id: CrmId): Promise<CrmTrial> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "UPDATE crm_trials SET status = 'cancelled' WHERE id = ? AND status = 'active'",
      [id],
    );
    if (result.affectedRows !== 1)
      throw new Error("crm_trial_mark_cancelled_conflict");
    return this.readBack(id, "crm_trial_mark_cancelled_readback_failed");
  }

  async markExpired(id: CrmId): Promise<CrmTrial> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "UPDATE crm_trials SET status = 'expired' WHERE id = ? AND status = 'active'",
      [id],
    );
    if (result.affectedRows !== 1)
      throw new Error("crm_trial_mark_expired_conflict");
    return this.readBack(id, "crm_trial_mark_expired_readback_failed");
  }

  async claimDue(id: CrmId, taskUid: string): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "UPDATE crm_trials SET schedule_cron_task_uid = ? WHERE id = ? AND status = 'active' AND end_date <= CURRENT_TIMESTAMP(3) AND schedule_cron_task_uid IS NULL",
      [taskUid, id],
    );
    return result.affectedRows === 1;
  }

  async releaseClaim(id: CrmId, taskUid: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_trials SET schedule_cron_task_uid = NULL WHERE id = ? AND status = 'active' AND schedule_cron_task_uid = ?",
      [id, taskUid],
    );
  }

  async markExpiredClaimed(id: CrmId, taskUid: string): Promise<CrmTrial> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "UPDATE crm_trials SET status = 'expired' WHERE id = ? AND status = 'active' AND schedule_cron_task_uid = ?",
      [id, taskUid],
    );
    if (result.affectedRows !== 1)
      throw new Error("crm_trial_scheduler_mark_expired_conflict");
    return this.readBack(
      id,
      "crm_trial_scheduler_mark_expired_readback_failed",
    );
  }

  async claimExpiredUnnotified(
    id: CrmId,
    taskUid: string,
    claimedAt: Date,
    staleBefore: Date,
  ): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "UPDATE crm_trials SET notification_task_uid = ?, notification_claimed_at = ? WHERE id = ? AND status = 'expired' AND notified_at IS NULL AND (notification_task_uid IS NULL OR notification_claimed_at IS NULL OR notification_claimed_at <= ?)",
      [taskUid, claimedAt, id, staleBefore],
    );
    return result.affectedRows === 1;
  }

  async releaseNotificationClaim(id: CrmId, taskUid: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_trials SET notification_task_uid = NULL, notification_claimed_at = NULL WHERE id = ? AND status = 'expired' AND notified_at IS NULL AND notification_task_uid = ?",
      [id, taskUid],
    );
  }

  async markNotifiedClaimed(
    id: CrmId,
    taskUid: string,
    notifiedAt: Date,
  ): Promise<CrmTrial> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "UPDATE crm_trials SET notified_at = ?, notification_task_uid = NULL, notification_claimed_at = NULL WHERE id = ? AND status = 'expired' AND notified_at IS NULL AND notification_task_uid = ?",
      [notifiedAt, id, taskUid],
    );
    if (result.affectedRows !== 1)
      throw new Error("crm_trial_notification_mark_notified_conflict");
    return this.readBack(
      id,
      "crm_trial_notification_mark_notified_readback_failed",
    );
  }

  async updateLeadStage(input: {
    readonly leadId: CrmId;
    readonly stage: "trial" | "active_client";
    readonly convertedAt?: Date;
  }): Promise<void> {
    if (input.convertedAt) {
      await this.pool.execute(
        "UPDATE crm_leads SET stage = ?, converted_at = ? WHERE id = ?",
        [input.stage, input.convertedAt, input.leadId],
      );
      return;
    }
    await this.pool.execute("UPDATE crm_leads SET stage = ? WHERE id = ?", [
      input.stage,
      input.leadId,
    ]);
  }

  async appendInteraction(input: {
    readonly leadId: CrmId;
    readonly content: string;
    readonly actorSubject: string;
  }): Promise<void> {
    await this.pool.execute(
      "INSERT INTO crm_interactions (lead_id, type, content, metadata, actor_subject) VALUES (?, 'system', ?, NULL, ?)",
      [input.leadId, input.content, input.actorSubject],
    );
  }

  private async readBack(id: CrmId, errorCode: string): Promise<CrmTrial> {
    const updated = await this.findById(id);
    if (!updated) throw new Error(errorCode);
    return updated;
  }
}
