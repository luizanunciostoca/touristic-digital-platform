import { describe, expect, it } from "vitest";

import {
  crmLeadStageLabels,
  crmSettingsFunnelStages,
  crmSettingsV1Baseline,
} from "./settings-contract.js";

describe("CRM M139 frozen Settings contract", () => {
  it("preserves the V1 Settings follow-up defaults and browser bounds", () => {
    expect(crmSettingsV1Baseline).toEqual({
      systemName: "Morro Digital CRM",
      frozenVersion: "1.1.0",
      followUpDefaults: {
        name: "Padrão",
        intervalDays: 3,
        maxAttempts: 5,
        isActive: true,
      },
      followUpBounds: {
        intervalDays: { min: 1, max: 30 },
        maxAttempts: { min: 1, max: 20 },
      },
    });
  });

  it("freezes the 16 V1 funnel stages in canonical domain order", () => {
    expect(crmSettingsFunnelStages).toEqual([
      { stage: "new_lead", label: "Novo Lead" },
      { stage: "first_contact", label: "Primeiro Contato" },
      { stage: "meeting_scheduled", label: "Reunião Agendada" },
      { stage: "proposal_sent", label: "Proposta Enviada" },
      { stage: "trial", label: "Trial" },
      { stage: "contract_sent", label: "Contrato Enviado" },
      { stage: "contract_signed", label: "Contrato Assinado" },
      { stage: "payment_pending", label: "Pagamento Pendente" },
      { stage: "payment_done", label: "Pagamento Recebido" },
      { stage: "onboarding", label: "Onboarding" },
      { stage: "photo_visit_scheduled", label: "Visita Agendada" },
      { stage: "photo_visit_done", label: "Visita Realizada" },
      { stage: "published", label: "Publicado" },
      { stage: "announced", label: "Divulgado" },
      { stage: "feedback", label: "Feedback" },
      { stage: "active_client", label: "Cliente Ativo" },
    ]);
  });

  it("keeps terminal labels available without adding them to the V1 Settings funnel", () => {
    expect(crmLeadStageLabels.churned).toBe("Cancelado");
    expect(crmLeadStageLabels.lost).toBe("Perdido");
    expect(crmSettingsFunnelStages.map(({ stage }) => stage)).not.toContain(
      "churned",
    );
    expect(crmSettingsFunnelStages.map(({ stage }) => stage)).not.toContain(
      "lost",
    );
  });
});
