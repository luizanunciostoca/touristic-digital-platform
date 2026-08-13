import type {
  CrmReferralAuditEvent,
  CrmReferralAuditPort,
} from "@touristic/crm/referrals-boundary";
import type { Pool } from "mysql2/promise";

export class MySqlCrmReferralAuditPort implements CrmReferralAuditPort {
  constructor(private readonly pool: Pool) {}

  async record(event: CrmReferralAuditEvent): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_audit_events (operation, allowed, reason, actor_subject, lead_id)
       VALUES (?, ?, ?, ?, ?)`,
      [
        event.operation,
        event.allowed,
        event.reason,
        event.actorSubject,
        event.referrerLeadId,
      ],
    );
  }
}
