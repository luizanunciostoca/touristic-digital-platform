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
        const payload = JSON.parse(String(init?.body)) as Record<
          string,
          unknown
        >;
        expect(payload).toMatchObject({
          input: "me explique a história da Segunda Praia",
          userType: "tourist",
          context: {
            lastPlace: "Segunda Praia",
            lastCategory: "beaches",
            lastIntent: "place_search",
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

  it("fails closed when the server-side provider is unavailable", async () => {
    const handler = createAssistantLlmHandler({
      fetch: vi.fn(async () => new Response("{}", { status: 503 })),
    });
    await expect(handler(request())).resolves.toBeNull();
  });

  it("strips markup returned by the provider before rendering", async () => {
    const handler = createAssistantLlmHandler({
      fetch: vi.fn(async () =>
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
