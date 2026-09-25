import { describe, expect, it } from "vitest";

import { createAssistantConversationOrchestrator } from "./assistant-conversation-orchestrator.js";
import { composeConversationResponse } from "./assistant-conversation-response-composer.js";

describe("assistant conversation response composer", () => {
  it("uses previous conversation state to continue a PT-BR journey", () => {
    const conversation = createAssistantConversationOrchestrator({
      sessionId: "composer-session",
      now: () => 1,
    });
    conversation.transition({
      cause: "category_selected",
      messageKey: "category_selected",
      renderedText: "Praias, ótima escolha.",
      category: "beaches",
    });

    const result = composeConversationResponse({
      messageKey: "results_found",
      language: "pt",
      previousState: conversation.snapshot(),
      count: 4,
      draft: {
        message: "Encontrei 4 opções.",
        voiceCopy: "Encontrei 4 opções.",
        cta: "Ver lugares",
        errorFallback: "Tente novamente.",
      },
    });

    expect(result.message).toContain("continuarmos");
    expect(result.voiceCopy).toContain("4 opções");
  });

  it("recognizes offline recovery from previous state", () => {
    const conversation = createAssistantConversationOrchestrator({
      sessionId: "network-session",
      now: () => 1,
    });
    conversation.transition({
      cause: "offline",
      messageKey: "offline",
      renderedText: "Parece que a conexão caiu.",
      networkState: "offline",
    });

    const result = composeConversationResponse({
      messageKey: "online_restored",
      language: "pt",
      previousState: conversation.snapshot(),
      draft: {
        message: "Conexão de volta.",
        voiceCopy: "Conexão de volta.",
        cta: null,
        errorFallback: "Tente novamente.",
      },
    });

    expect(result.message).toContain("exatamente de onde paramos");
  });

  it("keeps non-PT locales deterministic and unchanged", () => {
    const conversation = createAssistantConversationOrchestrator({
      sessionId: "locale-session",
      now: () => 1,
    });
    const draft = {
      message: "I found 3 options.",
      voiceCopy: "I found 3 options.",
      cta: "View places",
      errorFallback: "Try again.",
    };

    expect(
      composeConversationResponse({
        messageKey: "results_found",
        language: "en",
        previousState: conversation.snapshot(),
        count: 3,
        draft,
      }),
    ).toEqual(draft);
  });
});
