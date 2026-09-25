import { describe, expect, it } from "vitest";

import { createAssistantConversationOrchestrator } from "./assistant-conversation-orchestrator.js";
import { evaluateConversationPolicy } from "./assistant-conversation-policy.js";

describe("assistant conversation policy", () => {
  it("prioritizes transaction and navigation states deterministically", () => {
    const conversation = createAssistantConversationOrchestrator({
      sessionId: "policy",
      now: () => 1_000,
    });
    const previousState = conversation.snapshot();

    expect(
      evaluateConversationPolicy({
        cause: "payment_approved",
        source: "payments",
        previousState,
        now: 2_000,
      }),
    ).toMatchObject({
      present: true,
      speak: true,
      priority: "transaction",
    });

    expect(
      evaluateConversationPolicy({
        cause: "navigation_active",
        source: "navigation",
        previousState,
        now: 2_000,
      }),
    ).toMatchObject({
      present: true,
      speak: false,
      priority: "navigation",
    });
  });

  it("suppresses low-priority chatter during cooldown", () => {
    const conversation = createAssistantConversationOrchestrator({
      sessionId: "policy-cooldown",
      now: () => 10_000,
    });
    const previousState = conversation.snapshot();

    expect(
      evaluateConversationPolicy({
        cause: "proactive_suggestion",
        source: "assistant_runtime",
        previousState,
        now: 12_000,
      }),
    ).toMatchObject({
      present: false,
      reason: "low_priority_cooldown",
    });

    expect(
      evaluateConversationPolicy({
        cause: "proactive_suggestion",
        source: "assistant_runtime",
        previousState,
        now: 16_000,
      }),
    ).toMatchObject({
      present: true,
      priority: "proactive",
    });
  });

  it("never downgrades provider errors to passive chatter", () => {
    const conversation = createAssistantConversationOrchestrator({
      sessionId: "policy-error",
      now: () => 100,
    });

    expect(
      evaluateConversationPolicy({
        cause: "provider_error",
        source: "network",
        previousState: conversation.snapshot(),
        now: 101,
      }),
    ).toMatchObject({
      present: true,
      speak: true,
      priority: "emergency",
      replace: false,
    });
  });
});
