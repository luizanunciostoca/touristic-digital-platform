import { describe, expect, it } from "vitest";

import { createAssistantConversationOrchestrator } from "./assistant-conversation-orchestrator.js";

describe("assistant conversation orchestrator", () => {
  it("preserves semantic continuity while the visible presenter replaces messages", () => {
    let tick = 1000;
    const orchestrator = createAssistantConversationOrchestrator({
      sessionId: "session-1",
      now: () => ++tick,
    });

    const category = orchestrator.transition({
      cause: "category_selected",
      messageKey: "category_selected",
      renderedText:
        "Praias, ótima escolha. Quer ver todas ou prefere filtrar primeiro?",
      category: "beaches",
      journey: "explore",
      journeyStep: "filters",
      source: "explore",
    });
    const results = orchestrator.transition({
      cause: "results_found",
      messageKey: "results_found",
      renderedText:
        "Perfeito. Encontrei 4 opções. Quer começar pela Segunda Praia?",
      resultCount: 4,
      journeyStep: "results",
      source: "explore",
    });
    const place = orchestrator.transition({
      cause: "place_selected",
      messageKey: "place_selected",
      renderedText:
        "Essa é a Segunda Praia. Posso te levar até lá ou mostrar mais detalhes.",
      place: "Segunda Praia",
      journeyStep: "place",
      source: "place",
    });

    expect(results.previousTurnId).toBe(category.id);
    expect(place.previousTurnId).toBe(results.id);
    expect(place.nextState.currentCategory).toBe("beaches");
    expect(place.nextState.currentPlace).toBe("Segunda Praia");
    expect(place.nextState.resultCount).toBe(4);
    expect(place.nextState.previousAssistantMessage).toContain("Segunda Praia");
    expect(orchestrator.recentTurns()).toHaveLength(3);
  });

  it("deduplicates repeated semantic presentations without losing the visible turn", () => {
    const orchestrator = createAssistantConversationOrchestrator({
      sessionId: "dedupe-session",
      now: () => 500,
    });
    const input = {
      cause: "results_found",
      messageKey: "results_found",
      renderedText: "Encontrei 4 opções.",
      source: "explore",
      category: "beaches",
      resultCount: 4,
    } as const;

    const first = orchestrator.transition(input);
    const duplicate = orchestrator.transition(input);

    expect(duplicate.id).toBe(first.id);
    expect(orchestrator.recentTurns()).toHaveLength(1);
    expect(orchestrator.observability()).toMatchObject({
      turnsCreated: 1,
      duplicateAttempts: 1,
    });
  });

  it("keeps previous category/place and supports stale async supersession", () => {
    const orchestrator = createAssistantConversationOrchestrator({
      sessionId: "session-2",
      now: () => 42,
    });

    orchestrator.transition({
      cause: "place_selected",
      messageKey: "place_selected",
      renderedText: "Essa é a Primeira Praia.",
      category: "beaches",
      place: "Primeira Praia",
    });
    orchestrator.transition({
      cause: "category_selected",
      messageKey: "category_selected",
      renderedText: "Restaurantes. Quer filtrar ou ver todos?",
      category: "restaurants",
      place: null,
    });

    const firstRequest = orchestrator.issueSequence();
    const secondRequest = orchestrator.issueSequence();
    const snapshot = orchestrator.snapshot();

    expect(snapshot.previousCategory).toBe("beaches");
    expect(snapshot.currentCategory).toBe("restaurants");
    expect(snapshot.previousPlace).toBe("Primeira Praia");
    expect(snapshot.currentPlace).toBeNull();
    expect(orchestrator.isCurrentSequence(firstRequest)).toBe(false);
    expect(orchestrator.isCurrentSequence(secondRequest)).toBe(true);
  });
});
