import type { CrmId, CrmReferral } from "@touristic/crm";
import type {
  CrmReferralBoundaryRepository,
  CrmReferralCreateRecord,
  CrmReferralPatch,
} from "@touristic/crm/referrals-boundary";
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

interface ReferralRow extends RowDataPacket {
  id: number;
  referrer_lead_id: number;
  referred_lead_id: number | null;
  referred_name: string;
  referred_phone: string | null;
  referred_email: string | null;
  status: CrmReferral["status"];
  benefit_description: string | null;
  benefit_granted_at: Date | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

const referralColumns =
  "id, referrer_lead_id, referred_lead_id, referred_name, referred_phone, referred_email, status, benefit_description, benefit_granted_at, notes, created_at, updated_at";

function mapReferral(row: ReferralRow): CrmReferral {
  return {
    id: row.id,
    referrerLeadId: row.referrer_lead_id,
    referredLeadId: row.referred_lead_id,
    referredName: row.referred_name,
    referredPhone: row.referred_phone,
    referredEmail: row.referred_email,
    status: row.status,
    benefitDescription: row.benefit_description,
    benefitGrantedAt: row.benefit_granted_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class MySqlCrmReferralRepository
  implements CrmReferralBoundaryRepository
{
  constructor(private readonly pool: Pool) {}

  async list(referrerLeadId?: CrmId): Promise<readonly CrmReferral[]> {
    const [rows] = referrerLeadId
      ? await this.pool.execute<ReferralRow[]>(
          `SELECT ${referralColumns} FROM crm_referrals WHERE referrer_lead_id = ? ORDER BY created_at DESC, id DESC`,
          [referrerLeadId],
        )
      : await this.pool.execute<ReferralRow[]>(
          `SELECT ${referralColumns} FROM crm_referrals ORDER BY created_at DESC, id DESC`,
        );
    return rows.map(mapReferral);
  }

  async findById(id: CrmId): Promise<CrmReferral | null> {
    const [rows] = await this.pool.execute<ReferralRow[]>(
      `SELECT ${referralColumns} FROM crm_referrals WHERE id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ? mapReferral(rows[0]) : null;
  }

  async leadExists(leadId: CrmId): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT id FROM crm_leads WHERE id = ? LIMIT 1",
      [leadId],
    );
    return rows.length > 0;
  }

  async create(record: CrmReferralCreateRecord): Promise<CrmReferral> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO crm_referrals (referrer_lead_id, referred_lead_id, referred_name, referred_phone, referred_email, status, benefit_description, benefit_granted_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.referrerLeadId,
        record.referredLeadId,
        record.referredName,
        record.referredPhone,
        record.referredEmail,
        record.status,
        record.benefitDescription,
        record.benefitGrantedAt,
        record.notes,
      ],
    );
    return this.readBack(result.insertId, "crm_referral_create_readback_failed");
  }

  async update(id: CrmId, patch: CrmReferralPatch): Promise<CrmReferral> {
    const columns: Record<keyof CrmReferralPatch, string> = {
      referredName: "referred_name",
      referredPhone: "referred_phone",
      referredEmail: "referred_email",
      notes: "notes",
      referredLeadId: "referred_lead_id",
      status: "status",
      benefitDescription: "benefit_description",
      benefitGrantedAt: "benefit_granted_at",
    };
    const entries = Object.entries(patch) as Array<
      [keyof CrmReferralPatch, string | number | Date | null]
    >;
    if (!entries.length) throw new Error("crm_referral_empty_update");
    await this.pool.execute(
      `UPDATE crm_referrals SET ${entries
        .map(([key]) => `${columns[key]} = ?`)
        .join(", ")} WHERE id = ?`,
      [...entries.map(([, value]) => value), id],
    );
    return this.readBack(id, "crm_referral_update_readback_failed");
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

  private async readBack(id: CrmId, errorCode: string): Promise<CrmReferral> {
    const referral = await this.findById(id);
    if (!referral) throw new Error(errorCode);
    return referral;
  }
}
