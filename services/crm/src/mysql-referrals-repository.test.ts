import { describe, expect, it } from "vitest";

import { MySqlCrmReferralAuditPort } from "./mysql-referrals-audit-port.js";
import { MySqlCrmReferralRepository } from "./mysql-referrals-repository.js";
import { crmM99ReferralsSchemaSql } from "./referrals-schema.js";

type Call = { sql: string; values: unknown[] | undefined };

function poolFixture(responses: unknown[] = []) {
  const calls: Call[] = [];
  const pool = {
    execute: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      return [responses.shift() ?? [], []];
    },
  };
  return { pool, calls };
}

const referralRow = {
  id: 41,
  referrer_lead_id: 7,
  referred_lead_id: null,
  referred_name: "Maria Silva",
  referred_phone: "71999999999",
  referred_email: "maria@example.com",
  status: "pending",
  benefit_description: null,
  benefit_granted_at: null,
  notes: "Cliente indicado",
  created_at: new Date("2026-08-13T03:30:00.000Z"),
  updated_at: new Date("2026-08-13T03:30:00.000Z"),
};

describe("CRM M99 MySQL referrals persistence", () => {
  it("freezes the V1 referral vocabulary and both lead relations", () => {
    expect(crmM99ReferralsSchemaSql).toContain(
      "CREATE TABLE IF NOT EXISTS crm_referrals",
    );
    expect(crmM99ReferralsSchemaSql).toContain(
      "ENUM('pending','contacted','converted','lost')",
    );
    expect(crmM99ReferralsSchemaSql).toContain(
      "CONSTRAINT crm_referrals_referrer_lead_fk",
    );
    expect(crmM99ReferralsSchemaSql).toContain(
      "CONSTRAINT crm_referrals_referred_lead_fk",
    );
    expect(crmM99ReferralsSchemaSql).toContain("ON DELETE SET NULL");
  });

  it("keeps referrer filtering prepared and maps persisted rows", async () => {
    const { pool, calls } = poolFixture([[referralRow]]);
    const repository = new MySqlCrmReferralRepository(pool as never);
    const result = await repository.list(7);
    expect(calls[0]?.sql).toContain("WHERE referrer_lead_id = ?");
    expect(calls[0]?.sql).not.toContain("referrer_lead_id = 7");
    expect(calls[0]?.values).toEqual([7]);
    expect(result[0]).toMatchObject({
      id: 41,
      referrerLeadId: 7,
      referredLeadId: null,
      referredName: "Maria Silva",
      status: "pending",
    });
  });

  it("reads back the generated referral id after a prepared insert", async () => {
    const { pool, calls } = poolFixture([{ insertId: 41 }, [referralRow]]);
    const repository = new MySqlCrmReferralRepository(pool as never);
    const created = await repository.create({
      referrerLeadId: 7,
      referredLeadId: null,
      referredName: "Maria Silva",
      referredPhone: "71999999999",
      referredEmail: "maria@example.com",
      status: "pending",
      benefitDescription: null,
      benefitGrantedAt: null,
      notes: "Cliente indicado",
    });
    expect(created.id).toBe(41);
    expect(calls[0]?.sql).toContain("INSERT INTO crm_referrals");
    expect(calls[0]?.sql).toContain("VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    expect(calls[0]?.sql).not.toContain("Maria Silva");
    expect(calls[0]?.values).toEqual([
      7,
      null,
      "Maria Silva",
      "71999999999",
      "maria@example.com",
      "pending",
      null,
      null,
      "Cliente indicado",
    ]);
    expect(calls[1]?.values).toEqual([41]);
  });

  it("uses prepared dynamic updates for lifecycle, lead linkage and benefit fields", async () => {
    const grantedAt = new Date("2026-08-13T04:00:00.000Z");
    const updatedRow = {
      ...referralRow,
      referred_lead_id: 33,
      status: "converted",
      benefit_description: "1 mês grátis",
      benefit_granted_at: grantedAt,
    };
    const { pool, calls } = poolFixture([{}, [updatedRow]]);
    const repository = new MySqlCrmReferralRepository(pool as never);
    const updated = await repository.update(41, {
      referredLeadId: 33,
      status: "converted",
      benefitDescription: "1 mês grátis",
      benefitGrantedAt: grantedAt,
    });
    expect(updated).toMatchObject({
      referredLeadId: 33,
      status: "converted",
      benefitDescription: "1 mês grátis",
      benefitGrantedAt: grantedAt,
    });
    expect(calls[0]?.sql).toContain("referred_lead_id = ?");
    expect(calls[0]?.sql).toContain("status = ?");
    expect(calls[0]?.sql).toContain("benefit_description = ?");
    expect(calls[0]?.sql).toContain("benefit_granted_at = ?");
    expect(calls[0]?.sql).not.toContain("1 mês grátis");
    expect(calls[0]?.values).toEqual([
      33,
      "converted",
      "1 mês grátis",
      grantedAt,
      41,
    ]);
  });

  it("persists referral interactions with the stable actor subject", async () => {
    const { pool, calls } = poolFixture();
    const repository = new MySqlCrmReferralRepository(pool as never);
    await repository.appendInteraction({
      leadId: 7,
      content: "Indicação convertida",
      actorSubject: "owner-1",
    });
    expect(calls[0]?.sql).toContain("VALUES (?, 'system', ?, NULL, ?)");
    expect(calls[0]?.sql).not.toContain("owner-1");
    expect(calls[0]?.values).toEqual([7, "Indicação convertida", "owner-1"]);
  });

  it("persists referral audit events against the referrer lead", async () => {
    const { pool, calls } = poolFixture();
    const audit = new MySqlCrmReferralAuditPort(pool as never);
    await audit.record({
      operation: "referral.convert",
      allowed: false,
      reason: "read_only_role",
      actorSubject: "viewer-1",
      referralId: 41,
      referrerLeadId: 7,
    });
    expect(calls[0]?.sql).toContain("INSERT INTO crm_audit_events");
    expect(calls[0]?.values).toEqual([
      "referral.convert",
      false,
      "read_only_role",
      "viewer-1",
      7,
    ]);
  });
});
