import { describe, expect, it } from "vitest";

import {
  crmActiveFunnelStages,
  crmChecklistSteps,
  crmContractStatuses,
  crmFunnelStageIndex,
  crmLeadStages,
  crmMeetingStatuses,
  crmProposalStatuses,
  crmReferralStatuses,
  crmTerminalLeadStages,
  crmTrialStatuses,
  isActiveCrmFunnelStage,
  isCrmLeadStage,
  normalizeCrmId,
} from "./index.js";

describe("CRM M68 frozen domain vocabulary", () => {
  it("preserves all 18 persisted lead stages in frozen schema order", () => {
    expect(crmLeadStages).toEqual([
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
      "churned",
      "lost",
    ]);
  });

  it("keeps the 16 active funnel stages distinct from churned/lost terminal classification", () => {
    expect(crmActiveFunnelStages).toHaveLength(16);
    expect(crmTerminalLeadStages).toEqual(["churned", "lost"]);
    expect(crmFunnelStageIndex("new_lead")).toBe(0);
    expect(crmFunnelStageIndex("active_client")).toBe(15);
    expect(crmFunnelStageIndex("churned")).toBeNull();
    expect(isActiveCrmFunnelStage("active_client")).toBe(true);
    expect(isActiveCrmFunnelStage("lost")).toBe(false);
  });

  it("preserves the separate 16-step operational checklist", () => {
    expect(crmChecklistSteps).toHaveLength(16);
    expect(crmChecklistSteps[0]).toBe("first_contact");
    expect(crmChecklistSteps.at(-1)).toBe("feedback_collected");
    expect(crmChecklistSteps).toContain("meeting_done");
    expect(crmChecklistSteps).toContain("contract_drafted");
  });

  it("preserves commercial and engagement status vocabularies", () => {
    expect(crmMeetingStatuses).toEqual([
      "scheduled",
      "done",
      "cancelled",
      "no_show",
    ]);
    expect(crmProposalStatuses).toEqual([
      "draft",
      "sent",
      "viewed",
      "accepted",
      "rejected",
    ]);
    expect(crmContractStatuses).toEqual([
      "draft",
      "sent",
      "signed",
      "cancelled",
    ]);
    expect(crmTrialStatuses).toEqual([
      "active",
      "expired",
      "converted",
      "cancelled",
    ]);
    expect(crmReferralStatuses).toEqual([
      "pending",
      "contacted",
      "converted",
      "lost",
    ]);
  });

  it("fails closed for unknown stage values and invalid record ids", () => {
    expect(isCrmLeadStage("proposal_sent")).toBe(true);
    expect(isCrmLeadStage("proposal_accepted")).toBe(false);
    expect(isCrmLeadStage(null)).toBe(false);

    expect(normalizeCrmId(1)).toBe(1);
    expect(normalizeCrmId(0)).toBeNull();
    expect(normalizeCrmId(-1)).toBeNull();
    expect(normalizeCrmId(1.5)).toBeNull();
    expect(normalizeCrmId("1")).toBeNull();
  });
});
