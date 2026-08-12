import type {
  CrmMeetingBoundaryRepository,
  CrmMeetingCreateRecord,
  CrmMeetingUpdateRecord,
} from "@touristic/crm/meetings-boundary";
import type { CrmId, CrmMeeting } from "@touristic/crm";
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

interface MeetingRow extends RowDataPacket {
  id: number;
  lead_id: number;
  title: string;
  scheduled_at: Date;
  modality: CrmMeeting["modality"];
  meeting_link: string | null;
  location: string | null;
  status: CrmMeeting["status"];
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

const meetingColumns =
  "id, lead_id, title, scheduled_at, modality, meeting_link, location, status, notes, created_at, updated_at";

function mapMeeting(row: MeetingRow): CrmMeeting {
  return {
    id: row.id,
    leadId: row.lead_id,
    title: row.title,
    scheduledAt: row.scheduled_at,
    modality: row.modality,
    meetingLink: row.meeting_link,
    location: row.location,
    status: row.status,
    notes: row.notes,
    createdById: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class MySqlCrmMeetingRepository
  implements CrmMeetingBoundaryRepository
{
  constructor(private readonly pool: Pool) {}

  async list(leadId?: CrmId): Promise<readonly CrmMeeting[]> {
    const [rows] = leadId
      ? await this.pool.execute<MeetingRow[]>(
          `SELECT ${meetingColumns} FROM crm_meetings WHERE lead_id = ? ORDER BY scheduled_at DESC, id DESC`,
          [leadId],
        )
      : await this.pool.execute<MeetingRow[]>(
          `SELECT ${meetingColumns} FROM crm_meetings ORDER BY scheduled_at DESC, id DESC`,
        );
    return rows.map(mapMeeting);
  }

  async findById(id: CrmId): Promise<CrmMeeting | null> {
    const [rows] = await this.pool.execute<MeetingRow[]>(
      `SELECT ${meetingColumns} FROM crm_meetings WHERE id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ? mapMeeting(rows[0]) : null;
  }

  async leadExists(leadId: CrmId): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT id FROM crm_leads WHERE id = ? LIMIT 1",
      [leadId],
    );
    return rows.length > 0;
  }

  async create(record: CrmMeetingCreateRecord): Promise<CrmMeeting> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO crm_meetings (lead_id, title, scheduled_at, modality, meeting_link, location, status, notes, created_by_subject)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.leadId,
        record.title,
        record.scheduledAt,
        record.modality,
        record.meetingLink,
        record.location,
        record.status,
        record.notes,
        record.createdBySubject,
      ],
    );
    const created = await this.findById(result.insertId);
    if (!created) throw new Error("crm_meeting_create_readback_failed");
    return created;
  }

  async update(
    id: CrmId,
    patch: CrmMeetingUpdateRecord,
  ): Promise<CrmMeeting> {
    const columns: Record<keyof CrmMeetingUpdateRecord, string> = {
      title: "title",
      scheduledAt: "scheduled_at",
      modality: "modality",
      meetingLink: "meeting_link",
      location: "location",
      status: "status",
      notes: "notes",
    };
    const entries = Object.entries(patch) as [
      keyof CrmMeetingUpdateRecord,
      CrmMeetingUpdateRecord[keyof CrmMeetingUpdateRecord],
    ][];
    if (!entries.length) throw new Error("crm_meeting_empty_update");
    await this.pool.execute(
      `UPDATE crm_meetings SET ${entries
        .map(([key]) => `${columns[key]} = ?`)
        .join(", ")} WHERE id = ?`,
      [...entries.map(([, value]) => value), id],
    );
    const updated = await this.findById(id);
    if (!updated) throw new Error("crm_meeting_update_readback_failed");
    return updated;
  }

  async appendInteraction(input: {
    readonly leadId: CrmId;
    readonly content: string;
    readonly actorSubject: string;
    readonly metadata?: Readonly<Record<string, string>>;
  }): Promise<void> {
    await this.pool.execute(
      "INSERT INTO crm_interactions (lead_id, type, content, metadata, actor_subject) VALUES (?, 'meeting', ?, ?, ?)",
      [
        input.leadId,
        input.content,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.actorSubject,
      ],
    );
  }
}
