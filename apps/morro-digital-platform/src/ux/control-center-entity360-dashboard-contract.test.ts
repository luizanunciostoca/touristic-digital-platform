import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../../../control-center/public/control-center.js", import.meta.url),
  "utf8",
);

describe("Control Center high-information administrative surfaces", () => {
  it("provides functional, accessible Entity 360 tabs for Business, Affiliate and User", () => {
    expect(source).toContain('role="tab"');
    expect(source).toContain('role="tabpanel"');
    expect(source).toContain('event.key === "ArrowRight"');
    expect(source).toContain('event.key === "ArrowLeft"');
    expect(source).toContain('entityTabs("business360"');
    expect(source).toContain('entityTabs("affiliate360"');
    expect(source).toContain('entityTabs("user360"');
    for (const label of [
      "Overview",
      "Identity / Profile",
      "Relationships",
      "Commercial / Financial",
      "Activity",
      "Audit",
      "Settings / Actions",
    ]) {
      expect(source).toContain(label);
    }
  });

  it("uses only canonical relation identifiers and never infers Business ownership from an entity substring", () => {
    expect(source).not.toContain("includes(businessId)");
    expect(source).toContain("relatedEntityIds.has(entry.entityId)");
    expect(source).toContain("entry.tenantId === relation.id");
    expect(source).toContain('href="#users:${encodeURIComponent(member.id)}"');
    expect(source).toContain(
      "relationshipsContent = (selectedUser.businessIds ?? []).length",
    );
    expect(source).toContain('href="#businesses:${encodeURIComponent(');
    expect(source).toContain('data-destination-relation="unavailable"');
    expect(source).toContain("não atribuído pelo owner; não inferido");
  });

  it("keeps Affiliate destination and audit relations owner-backed and exact", () => {
    expect(source).toContain("affiliateMembershipEntityIds = memberships.map");
    expect(source).toContain(
      "(membership) => `${affiliateId}:${membership.programId}`",
    );
    expect(source).toContain(
      'href="#destinations:${encodeURIComponent(membership.destinationId)}"',
    );
    expect(source).toContain('kind: "affiliate"');
  });

  it("renders Dashboard owner states without synthesizing unavailable values", () => {
    expect(source).toContain(
      'readOwnerProjection("/affiliates?limit=250", "data")',
    );
    expect(source).toContain(
      'readOwnerProjection("/destinations", "destinations")',
    );
    expect(source).toContain(
      'readOwnerProjection("/audit?limit=20", "entries")',
    );
    expect(source).toContain("Precisa de atenção");
    expect(source).toContain("Destination Summary");
    expect(source).toContain("Affiliate Summary");
    expect(source).toContain("Afiliados carregados (máx. 250)");
    expect(source).toContain("no recorte carregado");
    expect(source).toContain("dashboard.attention");
    expect(source).toContain("dashboard.destinationSummary");
    expect(source).toContain("dashboardAggregateState");
    expect(source).toContain("Alertas conhecidos");
    expect(source).toContain("nenhum valor foi inferido");
    expect(source).toContain('return "unavailable"');
    expect(source).toContain('"partial"');
    expect(source).toContain('"success"');
    expect(source).toContain('"empty"');
    expect(source).not.toContain("Quick Actions");
  });

  it("projects authoritative Recent Activity with actor/effectiveUser, destination, entity, result, value and deep links", () => {
    for (const field of [
      "Timestamp",
      "Actor",
      "Effective user",
      "Destino",
      "Ação / resultado",
      "Entidade",
      "Valor",
      "Link",
    ]) {
      expect(source).toContain(field);
    }
    expect(source).toContain("entry.actorUserId");
    expect(source).toContain("entry.effectiveUserId");
    expect(source).toContain("entry.destinationId");
    expect(source).toContain("auditDeepLink(entry)");
    expect(source).toContain("auditFinancialValue(entry)");
    expect(source).toContain("(minor units)");
  });

  it("keeps Support Mode identity explicit and privileged UI bound to the real actor", () => {
    expect(source).toContain("actor real");
    expect(source).toContain("effectiveUser");
    expect(source).toContain("supportEntityContext()");
    expect(source).toContain("active && !supportActive");
    expect(source).toContain("Indisponível em Support Mode");
  });
});
