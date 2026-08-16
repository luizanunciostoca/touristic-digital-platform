import type {
  CrmLeadBoundaryRepository,
  CrmLeadCreateRecord,
  CrmLeadUpdateRecord,
} from "@touristic/crm/leads-boundary";
import {
  crmChecklistSteps,
  type CrmId,
  type CrmLead,
  type CrmLeadQuery,
  type CrmLeadStage,
} from "@touristic/crm";
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

interface LeadRow extends RowDataPacket {
  id: number;
  company_name: string;
  segment: string | null;
  contact_name: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  notes: string | null;
  stage: CrmLead["stage"];
  status: CrmLead["status"];
  source: string | null;
  referred_by_id: number | null;
  monthly_value: string | null;
  created_at: Date;
  updated_at: Date;
  last_contact_at: Date | null;
  converted_at: Date | null;
}

const leadColumns = `id, company_name, segment, contact_name, phone, whatsapp, email, address, website, notes, stage, status, source, referred_by_id, monthly_value, created_at, updated_at, last_contact_at, converted_at`;

function mapLead(row: LeadRow): CrmLead {
  return {
    id: row.id,
    companyName: row.company_name,
    segment: row.segment,
    contactName: row.contact_name,
    phone: row.phone,
    whatsapp: row.whatsapp,
    email: row.email,
    address: row.address,
    website: row.website,
    notes: row.notes,
    stage: row.stage,
    status: row.status,
    source: row.source,
    referredById: row.referred_by_id,
    assignedToId: null,
    monthlyValue: row.monthly_value,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastContactAt: row.last_contact_at,
    convertedAt: row.converted_at,
  };
}

function boundedLimit(value: number | undefined): number {
  return Number.isSafeInteger(value) &&
    value !== undefined &&
    value >= 1 &&
    value <= 200
    ? value
    : 50;
}

function boundedOffset(value: number | undefined): number {
  return Number.isSafeInteger(value) && value !== undefined && value >= 0
    ? value
    : 0;
}

function persistenceValue(
  key: keyof CrmLeadUpdateRecord,
  value: string,
): string | null {
  if (key !== "companyName" && key !== "status" && value === "") {
    return null;
  }
  return value;
}

export class MySqlCrmLeadRepository implements CrmLeadBoundaryRepository {
  constructor(private readonly pool: Pool) {}

  async list(query?: CrmLeadQuery): Promise<readonly CrmLead[]> {
    const where: string[] = [];
    const values: Array<string | number | Date | null> = [];
    if (query?.stage) {
      where.push("stage = ?");
      values.push(query.stage);
    }
    if (query?.status) {
      where.push("status = ?");
      values.push(query.status);
    }
    if (query?.search) {
      where.push(
        "(company_name LIKE ? OR contact_name LIKE ? OR email LIKE ?)",
      );
      const pattern = `%${query.search}%`;
      values.push(pattern, pattern, pattern);
    }
    const limit = boundedLimit(query?.limit);
    const offset = boundedOffset(query?.offset);
    const clause = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const [rows] = await this.pool.execute<LeadRow[]>(
      `SELECT ${leadColumns} FROM crm_leads${clause} ORDER BY updated_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}`,
      values,
    );
    return rows.map(mapLead);
  }

  async findById(id: CrmId): Promise<CrmLead | null> {
    const [rows] = await this.pool.execute<LeadRow[]>(
      `SELECT ${leadColumns} FROM crm_leads WHERE id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ? mapLead(rows[0]) : null;
  }

  async create(record: CrmLeadCreateRecord): Promise<CrmLead> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO crm_leads (company_name, segment, contact_name, phone, whatsapp, email, address, website, notes, stage, status, source, assigned_to_subject, monthly_value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.companyName,
        record.segment ?? null,
        record.contactName ?? null,
        record.phone ?? null,
        record.whatsapp ?? null,
        record.email ?? null,
        record.address ?? null,
        record.website ?? null,
        record.notes ?? null,
        record.stage,
        record.status,
        record.source ?? null,
        record.assignedToSubject,
        record.monthlyValue ?? null,
      ],
    );
    const created = await this.findById(result.insertId);
    if (!created) throw new Error("crm_lead_create_readback_failed");
    return created;
  }

  async update(id: CrmId, patch: CrmLeadUpdateRecord): Promise<CrmLead> {
    const columns: Record<keyof CrmLeadUpdateRecord, string> = {
      companyName: "company_name",
      segment: "segment",
      contactName: "contact_name",
      phone: "phone",
      whatsapp: "whatsapp",
      email: "email",
      address: "address",
      website: "website",
      notes: "notes",
      source: "source",
      monthlyValue: "monthly_value",
      status: "status",
    };
    const entries = Object.entries(patch) as [
      keyof CrmLeadUpdateRecord,
      string,
    ][];
    if (!entries.length) throw new Error("crm_lead_empty_update");
    await this.pool.execute(
      `UPDATE crm_leads SET ${entries.map(([key]) => `${columns[key]} = ?`).join(", ")} WHERE id = ?`,
      [...entries.map(([key, value]) => persistenceValue(key, value)), id],
    );
    const updated = await this.findById(id);
    if (!updated) throw new Error("crm_lead_update_readback_failed");
    return updated;
  }

  async updateStage(
    id: CrmId,
    stage: CrmLeadStage,
    lastContactAt: Date,
  ): Promise<CrmLead> {
    await this.pool.execute(
      "UPDATE crm_leads SET stage = ?, last_contact_at = ? WHERE id = ?",
      [stage, lastContactAt, id],
    );
    const updated = await this.findById(id);
    if (!updated) throw new Error("crm_lead_stage_readback_failed");
    return updated;
  }

  async delete(id: CrmId): Promise<void> {
    await this.pool.execute("DELETE FROM crm_leads WHERE id = ?", [id]);
  }

  async initializeChecklist(leadId: CrmId): Promise<void> {
    for (const step of crmChecklistSteps) {
      await this.pool.execute(
        "INSERT IGNORE INTO crm_checklist_items (lead_id, step) VALUES (?, ?)",
        [leadId, step],
      );
    }
  }

  async appendInteraction(input: {
    readonly leadId: CrmId;
    readonly type: "system" | "stage_change";
    readonly content: string;
    readonly actorSubject: string;
    readonly metadata?: Readonly<Record<string, string>>;
  }): Promise<void> {
    await this.pool.execute(
      "INSERT INTO crm_interactions (lead_id, type, content, metadata, actor_subject) VALUES (?, ?, ?, ?, ?)",
      [
        input.leadId,
        input.type,
        input.content,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.actorSubject,
      ],
    );
  }
}
