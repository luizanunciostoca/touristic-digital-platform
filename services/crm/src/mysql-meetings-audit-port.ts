import type {
  CrmMeetingAuditEvent,
  CrmMeetingAuditPort,
} from "@touristic/crm/meetings-boundary";
import type { Pool } from "mysql2/promise";

export class MySqlCrmMeetingAuditPort implements CrmMeetingAuditPort {
  constructor(private readonly pool: Pool) {}

  async record(event: CrmMeetingAuditEvent): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_audit_events (operation, allowed, reason, actor_subject, lead_id)
       VALUES (?, ?, ?, ?, ?)`,
      [
        event.operation,
        event.allowed,
        event.reason,
        event.actorSubject,
        event.leadId,
      ],
    );
  }
}
