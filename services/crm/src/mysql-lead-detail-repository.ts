import type {
  CrmLeadDetailChecklistRecord,
  CrmLeadDetailInteractionRecord,
  CrmLeadDetailRepository,
} from "@touristic/crm/lead-detail-boundary";
import type {
  CrmChecklistStep,
  CrmId,
  CrmInteractionType,
  CrmLead,
} from "@touristic/crm";
import type { Pool, RowDataPacket } from "mysql2/promise";

import { MySqlCrmLeadRepository } from "./mysql-leads-repository.js";

interface ChecklistRow extends RowDataPacket {
  id: number;
  lead_id: number;
  step: CrmChecklistStep;
  completed: number | boolean;
  completed_at: Date | null;
  completed_by_subject: string | null;
  notes: string | null;
  created_at: Date;
}

interface InteractionRow extends RowDataPacket {
  id: number;
  lead_id: number;
  type: CrmInteractionType;
  content: string;
  metadata: unknown;
  actor_subject: string;
  created_at: Date;
}

const checklistColumns =
  "id, lead_id, step, completed, completed_at, completed_by_subject, notes, created_at";
const interactionColumns =
  "id, lead_id, type, content, metadata, actor_subject, created_at";

function mapChecklist(row: ChecklistRow): CrmLeadDetailChecklistRecord {
  return {
    id: row.id,
    leadId: row.lead_id,
    step: row.step,
    completed: Boolean(row.completed),
    completedAt: row.completed_at,
    completedBySubject: row.completed_by_subject,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function mapInteraction(row: InteractionRow): CrmLeadDetailInteractionRecord {
  return {
    id: row.id,
    leadId: row.lead_id,
    type: row.type,
    content: row.content,
    metadata: row.metadata,
    actorSubject: row.actor_subject,
    createdAt: row.created_at,
  };
}

export class MySqlCrmLeadDetailRepository implements CrmLeadDetailRepository {
  private readonly leads: MySqlCrmLeadRepository;

  constructor(private readonly pool: Pool) {
    this.leads = new MySqlCrmLeadRepository(pool);
  }

  findLeadById(id: CrmId): Promise<CrmLead | null> {
    return this.leads.findById(id);
  }

  async listChecklist(
    leadId: CrmId,
  ): Promise<readonly CrmLeadDetailChecklistRecord[]> {
    const [rows] = await this.pool.execute<ChecklistRow[]>(
      `SELECT ${checklistColumns} FROM crm_checklist_items WHERE lead_id = ? ORDER BY id ASC`,
      [leadId],
    );
    return rows.map(mapChecklist);
  }

  async findChecklistItemById(
    id: CrmId,
  ): Promise<CrmLeadDetailChecklistRecord | null> {
    const [rows] = await this.pool.execute<ChecklistRow[]>(
      `SELECT ${checklistColumns} FROM crm_checklist_items WHERE id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ? mapChecklist(rows[0]) : null;
  }

  async setChecklistCompletion(input: {
    readonly id: CrmId;
    readonly leadId: CrmId;
    readonly completed: boolean;
    readonly completedAt: Date | null;
    readonly completedBySubject: string | null;
  }): Promise<CrmLeadDetailChecklistRecord | null> {
    await this.pool.execute(
      `UPDATE crm_checklist_items
       SET completed = ?, completed_at = ?, completed_by_subject = ?
       WHERE id = ? AND lead_id = ?`,
      [
        input.completed,
        input.completedAt,
        input.completedBySubject,
        input.id,
        input.leadId,
      ],
    );
    const updated = await this.findChecklistItemById(input.id);
    return updated?.leadId === input.leadId ? updated : null;
  }

  async listInteractions(
    leadId: CrmId,
  ): Promise<readonly CrmLeadDetailInteractionRecord[]> {
    const [rows] = await this.pool.execute<InteractionRow[]>(
      `SELECT ${interactionColumns} FROM crm_interactions
       WHERE lead_id = ? ORDER BY created_at DESC, id DESC LIMIT 200`,
      [leadId],
    );
    return rows.map(mapInteraction);
  }

  async appendInteraction(input: {
    readonly leadId: CrmId;
    readonly type: CrmInteractionType;
    readonly content: string;
    readonly actorSubject: string;
    readonly metadata?: Readonly<Record<string, string>>;
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_interactions (lead_id, type, content, metadata, actor_subject)
       VALUES (?, ?, ?, ?, ?)`,
      [
        input.leadId,
        input.type,
        input.content,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.actorSubject,
      ],
    );
  }

  async touchLeadLastContactAt(
    leadId: CrmId,
    lastContactAt: Date,
  ): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_leads SET last_contact_at = ? WHERE id = ?",
      [lastContactAt, leadId],
    );
  }
}
