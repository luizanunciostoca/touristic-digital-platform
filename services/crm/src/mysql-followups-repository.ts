import type { CrmFollowUp, CrmFollowUpSetting, CrmId } from "@touristic/crm";
import type {
  CrmFollowUpBoundaryRepository,
  CrmFollowUpCreateRecord,
  CrmFollowUpSettingRecord,
} from "@touristic/crm/followups-boundary";
import type { CrmFollowUpSchedulerRepository } from "@touristic/crm/followups-scheduler";
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

interface FollowUpSettingRow extends RowDataPacket {
  id: number;
  name: string;
  interval_days: number;
  max_attempts: number;
  message_template: string | null;
  is_active: number | boolean;
  created_at: Date;
  updated_at: Date;
}

interface FollowUpRow extends RowDataPacket {
  id: number;
  lead_id: number;
  setting_id: number | null;
  attempt_number: number;
  status: CrmFollowUp["status"];
  generated_message: string | null;
  scheduled_at: Date;
  sent_at: Date | null;
  responded_at: Date | null;
  schedule_cron_task_uid: string | null;
  created_at: Date;
  updated_at: Date;
}

const followUpColumns =
  "id, lead_id, setting_id, attempt_number, status, generated_message, scheduled_at, sent_at, responded_at, schedule_cron_task_uid, created_at, updated_at";

function mapSetting(row: FollowUpSettingRow): CrmFollowUpSetting {
  return {
    id: row.id,
    name: row.name,
    intervalDays: row.interval_days,
    maxAttempts: row.max_attempts,
    messageTemplate: row.message_template,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFollowUp(row: FollowUpRow): CrmFollowUp {
  return {
    id: row.id,
    leadId: row.lead_id,
    settingId: row.setting_id,
    attemptNumber: row.attempt_number,
    status: row.status,
    generatedMessage: row.generated_message,
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at,
    respondedAt: row.responded_at,
    scheduleCronTaskUid: row.schedule_cron_task_uid,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class MySqlCrmFollowUpRepository
  implements CrmFollowUpBoundaryRepository, CrmFollowUpSchedulerRepository
{
  constructor(private readonly pool: Pool) {}

  async listSettings(): Promise<readonly CrmFollowUpSetting[]> {
    const [rows] = await this.pool.execute<FollowUpSettingRow[]>(
      "SELECT id, name, interval_days, max_attempts, message_template, is_active, created_at, updated_at FROM crm_follow_up_settings ORDER BY id ASC",
    );
    return rows.map(mapSetting);
  }

  async upsertSetting(
    record: CrmFollowUpSettingRecord,
  ): Promise<CrmFollowUpSetting> {
    if (record.id) {
      await this.pool.execute(
        "UPDATE crm_follow_up_settings SET name = ?, interval_days = ?, max_attempts = ?, message_template = ?, is_active = ? WHERE id = ?",
        [
          record.name,
          record.intervalDays,
          record.maxAttempts,
          record.messageTemplate,
          record.isActive,
          record.id,
        ],
      );
      const updated = await this.findSettingById(record.id);
      if (!updated)
        throw new Error("crm_follow_up_setting_update_readback_failed");
      return updated;
    }

    const [result] = await this.pool.execute<ResultSetHeader>(
      "INSERT INTO crm_follow_up_settings (name, interval_days, max_attempts, message_template, is_active) VALUES (?, ?, ?, ?, ?)",
      [
        record.name,
        record.intervalDays,
        record.maxAttempts,
        record.messageTemplate,
        record.isActive,
      ],
    );
    const created = await this.findSettingById(result.insertId);
    if (!created)
      throw new Error("crm_follow_up_setting_create_readback_failed");
    return created;
  }

  private async findSettingById(id: CrmId): Promise<CrmFollowUpSetting | null> {
    const [rows] = await this.pool.execute<FollowUpSettingRow[]>(
      "SELECT id, name, interval_days, max_attempts, message_template, is_active, created_at, updated_at FROM crm_follow_up_settings WHERE id = ? LIMIT 1",
      [id],
    );
    return rows[0] ? mapSetting(rows[0]) : null;
  }

  async list(leadId?: CrmId): Promise<readonly CrmFollowUp[]> {
    const [rows] = leadId
      ? await this.pool.execute<FollowUpRow[]>(
          `SELECT ${followUpColumns} FROM crm_follow_ups WHERE lead_id = ? ORDER BY scheduled_at ASC, id ASC`,
          [leadId],
        )
      : await this.pool.execute<FollowUpRow[]>(
          `SELECT ${followUpColumns} FROM crm_follow_ups ORDER BY scheduled_at ASC, id ASC`,
        );
    return rows.map(mapFollowUp);
  }

  async listPending(): Promise<readonly CrmFollowUp[]> {
    const [rows] = await this.pool.execute<FollowUpRow[]>(
      `SELECT ${followUpColumns} FROM crm_follow_ups WHERE status = 'pending' AND scheduled_at <= CURRENT_TIMESTAMP(3) AND schedule_cron_task_uid IS NULL ORDER BY scheduled_at ASC, id ASC`,
    );
    return rows.map(mapFollowUp);
  }

  async findById(id: CrmId): Promise<CrmFollowUp | null> {
    const [rows] = await this.pool.execute<FollowUpRow[]>(
      `SELECT ${followUpColumns} FROM crm_follow_ups WHERE id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ? mapFollowUp(rows[0]) : null;
  }

  async leadExists(leadId: CrmId): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT id FROM crm_leads WHERE id = ? LIMIT 1",
      [leadId],
    );
    return rows.length > 0;
  }

  async settingExists(settingId: CrmId): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT id FROM crm_follow_up_settings WHERE id = ? LIMIT 1",
      [settingId],
    );
    return rows.length > 0;
  }

  async create(record: CrmFollowUpCreateRecord): Promise<CrmFollowUp> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "INSERT INTO crm_follow_ups (lead_id, setting_id, attempt_number, status, scheduled_at) VALUES (?, ?, ?, ?, ?)",
      [
        record.leadId,
        record.settingId,
        record.attemptNumber,
        record.status,
        record.scheduledAt,
      ],
    );
    const created = await this.findById(result.insertId);
    if (!created) throw new Error("crm_follow_up_create_readback_failed");
    return created;
  }

  async markSent(id: CrmId, sentAt: Date): Promise<CrmFollowUp> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "UPDATE crm_follow_ups SET status = 'sent', sent_at = ? WHERE id = ? AND status = 'pending'",
      [sentAt, id],
    );
    if (result.affectedRows !== 1)
      throw new Error("crm_follow_up_mark_sent_conflict");
    const updated = await this.findById(id);
    if (!updated) throw new Error("crm_follow_up_mark_sent_readback_failed");
    return updated;
  }

  async markResponded(id: CrmId, respondedAt: Date): Promise<CrmFollowUp> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "UPDATE crm_follow_ups SET status = 'responded', responded_at = ? WHERE id = ? AND status = 'sent'",
      [respondedAt, id],
    );
    if (result.affectedRows !== 1)
      throw new Error("crm_follow_up_mark_responded_conflict");
    const updated = await this.findById(id);
    if (!updated)
      throw new Error("crm_follow_up_mark_responded_readback_failed");
    return updated;
  }

  async claimPending(id: CrmId, taskUid: string): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "UPDATE crm_follow_ups SET schedule_cron_task_uid = ? WHERE id = ? AND status = 'pending' AND scheduled_at <= CURRENT_TIMESTAMP(3) AND schedule_cron_task_uid IS NULL",
      [taskUid, id],
    );
    return result.affectedRows === 1;
  }

  async releaseClaim(id: CrmId, taskUid: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_follow_ups SET schedule_cron_task_uid = NULL WHERE id = ? AND status = 'pending' AND schedule_cron_task_uid = ?",
      [id, taskUid],
    );
  }

  async markSentClaimed(
    id: CrmId,
    taskUid: string,
    sentAt: Date,
  ): Promise<CrmFollowUp> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "UPDATE crm_follow_ups SET status = 'sent', sent_at = ? WHERE id = ? AND status = 'pending' AND schedule_cron_task_uid = ?",
      [sentAt, id, taskUid],
    );
    if (result.affectedRows !== 1)
      throw new Error("crm_follow_up_scheduler_mark_sent_conflict");
    const updated = await this.findById(id);
    if (!updated)
      throw new Error("crm_follow_up_scheduler_mark_sent_readback_failed");
    return updated;
  }

  async markSkippedClaimed(id: CrmId, taskUid: string): Promise<CrmFollowUp> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "UPDATE crm_follow_ups SET status = 'skipped' WHERE id = ? AND status = 'pending' AND schedule_cron_task_uid = ?",
      [id, taskUid],
    );
    if (result.affectedRows !== 1)
      throw new Error("crm_follow_up_scheduler_mark_skipped_conflict");
    const updated = await this.findById(id);
    if (!updated)
      throw new Error("crm_follow_up_scheduler_mark_skipped_readback_failed");
    return updated;
  }

  async updateLeadLastContact(leadId: CrmId, at: Date): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_leads SET last_contact_at = ? WHERE id = ?",
      [at, leadId],
    );
  }

  async appendInteraction(input: {
    readonly leadId: CrmId;
    readonly content: string;
    readonly actorSubject: string;
  }): Promise<void> {
    await this.pool.execute(
      "INSERT INTO crm_interactions (lead_id, type, content, metadata, actor_subject) VALUES (?, 'follow_up', ?, NULL, ?)",
      [input.leadId, input.content, input.actorSubject],
    );
  }
}
