import { describe, expect, it, vi } from "vitest";
import type { AssistantDialogIntentHandlerContext } from "@touristic/assistant";
import {
  analyzeAssistantIntent,
  createAssistantContextManager,
} from "@touristic/assistant";
import { createAssistantLlmHandler } from "./assistant-llm-adapter.js";

function request(input = "me explique a história da Segunda Praia") {
  const manager = createAssistantContextManager();
  manager.updateContext({
    lastPlace: "Segunda Praia",
    lastCategory: "beaches",
    lastIntent: "place_search",
    activeTour: {
      tourId: "trilha-gamboa",
      stage: "stop",
      currentStopIndex: 2,
      totalStops: 5,
    },
    navigationState: {
      active: true,
      destination: "Segunda Praia",
      phase: "active",
    },
  });
  manager.addToHistory({ input: "olá", response: "Olá!" });
  const context = manager.getContext();
  return {
    input,
    intent: analyzeAssistantIntent(input, {
      lastPlace: context.lastPlace,
      lastCategory: context.lastCategory,
      lastIntent: context.lastIntent,
      awaiting: context.awaiting,
    }),
    context,
  } satisfies AssistantDialogIntentHandlerContext;
}

describe("createAssistantLlmHandler", () => {
  it("posts sanitized context to the same-origin AI boundary", async () => {
    const fetchImplementation = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.credentials).toBe("same-origin");
        const body = init?.body;
        expect(typeof body).toBe("string");
        if (typeof body !== "string") throw new Error("expected string body");
        const payload = JSON.parse(body) as Record<string, unknown>;
        expect(payload).toMatchObject({
          input: "me explique a história da Segunda Praia",
          userType: "tourist",
          context: {
            lastPlace: "Segunda Praia",
            lastCategory: "beaches",
            lastIntent: "place_search",
            activeTour: {
              tourId: "trilha-gamboa",
              stage: "stop",
              currentStopIndex: 2,
              totalStops: 5,
            },
            navigationState: {
              active: true,
              destination: "Segunda Praia",
              phase: "active",
            },
          },
        });
        return new Response(
          JSON.stringify({
            text: "Segunda Praia tem uma história ligada ao desenvolvimento turístico de Morro.",
            intent: "cultural_history",
            action: "show_place:Segunda Praia",
            options: ["Ver no mapa"],
            confidence: 0.91,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    );
    const handler = createAssistantLlmHandler({ fetch: fetchImplementation });

    const response = await handler(request());

    expect(fetchImplementation).toHaveBeenCalledWith(
      "/api/ai/assistant/respond",
      expect.objectContaining({ method: "POST" }),
    );
    expect(response).toEqual({
      text: "Segunda Praia tem uma história ligada ao desenvolvimento turístico de Morro.",
      options: [{ label: "Ver no mapa", value: "Ver no mapa" }],
      metadata: {
        domain: "llm",
        state: "resolved",
        intent: "cultural_history",
        action: "show_place:Segunda Praia",
        confidence: 0.91,
        fromLLM: true,
      },
    });
  });

  it("normalizes impossible runtime context before sending it to the provider", async () => {
    const manager = createAssistantContextManager();
    manager.updateContext({
      activeTour: {
        tourId: "volta-a-ilha",
        stage: "stop",
        currentStopIndex: 1,
        totalStops: 8,
      },
      navigationState: {
        active: true,
        destination: "Forte",
        phase: "ended",
      },
    });
    const context = manager.getContext();
    const input = "me conte uma curiosidade cultural";
    const requestContext = {
      input,
      intent: analyzeAssistantIntent(input, {
        lastPlace: context.lastPlace,
        lastCategory: context.lastCategory,
        lastIntent: context.lastIntent,
        awaiting: context.awaiting,
      }),
      context,
    } satisfies AssistantDialogIntentHandlerContext;
    const fetchImplementation = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
        expect(body.context.navigationState).toEqual({
          active: false,
          destination: "Forte",
          phase: "ended",
        });
        return new Response(JSON.stringify({ text: "Resposta segura." }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    );

    const handler = createAssistantLlmHandler({ fetch: fetchImplementation });
    await handler(requestContext);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the server-side provider is unavailable", async () => {
    const handler = createAssistantLlmHandler({
      fetch: vi.fn(async () => new Response("{}", { status: 503 })),
    });
    await expect(handler(request())).resolves.toBeNull();
  });

  it("strips markup returned by the provider before rendering", async () => {
    const handler = createAssistantLlmHandler({
      fetch: vi.fn(
        async () =>
          new Response(
            JSON.stringify({ text: "<b>Seguro</b><script>x</script>" }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
      ),
    });
    const response = await handler(request());
    expect(response?.text).toBe("Seguro x");
  });
});
