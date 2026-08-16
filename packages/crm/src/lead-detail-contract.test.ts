import { describe, expect, it } from "vitest";

import { crmChecklistSteps } from "./index.js";
import {
  crmLeadDetailChecklist,
  crmLeadDetailInteractionLabels,
  crmLeadDetailManualInteractionTypes,
  crmLeadDetailStageLabels,
  crmLeadDetailStageOrder,
  crmLeadDetailStages,
  isCrmLeadDetailManualInteractionType,
} from "./lead-detail-contract.js";

describe("CRM M140 frozen lead detail presentation", () => {
  it("keeps the frozen 16-stage selector while preserving terminal-state labels", () => {
    expect(crmLeadDetailStageOrder).toEqual([
      "new_lead",
      "first_contact",
      "meeting_scheduled",
      "proposal_sent",
      "trial",
      "contract_sent",
      "contract_signed",
      "payment_pending",
      "payment_done",
      "onboarding",
      "photo_visit_scheduled",
      "photo_visit_done",
      "published",
      "announced",
      "feedback",
      "active_client",
    ]);
    expect(crmLeadDetailStages).toHaveLength(16);
    expect(crmLeadDetailStages.at(-1)).toEqual({
      stage: "active_client",
      label: "Cliente Ativo",
    });
    expect(crmLeadDetailStageLabels.churned).toBe("Cancelado");
    expect(crmLeadDetailStageLabels.lost).toBe("Perdido");
    expect(crmLeadDetailStages.some(({ stage }) => stage === "churned")).toBe(false);
    expect(crmLeadDetailStages.some(({ stage }) => stage === "lost")).toBe(false);
  });

  it("keeps every canonical checklist step in the frozen V1 order", () => {
    expect(crmLeadDetailChecklist.map(({ step }) => step)).toEqual([
      ...crmChecklistSteps,
    ]);
    expect(crmLeadDetailChecklist).toHaveLength(16);
    expect(crmLeadDetailChecklist[0]).toEqual({
      step: "first_contact",
      label: "Primeiro Contato",
      description: "Mensagem inicial enviada via WhatsApp",
    });
    expect(crmLeadDetailChecklist.at(-1)).toEqual({
      step: "feedback_collected",
      label: "Feedback Coletado",
      description: "Avaliação do cliente registrada",
    });
  });

  it("keeps system and stage-change events read-only in the manual interaction form", () => {
    expect(crmLeadDetailManualInteractionTypes).toEqual([
      "note",
      "whatsapp",
      "call",
      "email",
      "meeting",
      "proposal",
      "contract",
      "payment",
      "follow_up",
    ]);
    expect(isCrmLeadDetailManualInteractionType("note")).toBe(true);
    expect(isCrmLeadDetailManualInteractionType("system")).toBe(false);
    expect(isCrmLeadDetailManualInteractionType("stage_change")).toBe(false);
    expect(crmLeadDetailInteractionLabels.system).toBe("Sistema");
  });
});
