import type { ConversationStateSnapshot } from "./assistant-conversation-orchestrator.js";

export interface ConversationResponseDraft {
  readonly message: string;
  readonly voiceCopy: string;
  readonly cta: string | null;
  readonly errorFallback: string;
}

export interface ConversationResponseComposerInput {
  readonly messageKey: string;
  readonly language: "pt" | "en" | "es" | "he";
  readonly draft: ConversationResponseDraft;
  readonly previousState: ConversationStateSnapshot;
  readonly category?: string | null;
  readonly place?: string | null;
  readonly count?: number | null;
}

function sentence(value: string): string {
  const trimmed = value.trim();
  return trimmed.endsWith(".") || trimmed.endsWith("?") || trimmed.endsWith("!")
    ? trimmed
    : `${trimmed}.`;
}

export function composeConversationResponse(
  input: ConversationResponseComposerInput,
): ConversationResponseDraft {
  const { previousState, draft } = input;
  if (input.language !== "pt") return draft;

  if (
    input.messageKey === "results_found" &&
    input.count &&
    previousState.currentCategory
  ) {
    return Object.freeze({
      ...draft,
      message: `Perfeito. Encontrei ${input.count} opções para continuarmos. Quer escolher uma delas agora?`,
      voiceCopy: `Encontrei ${input.count} opções. Quer escolher uma agora?`,
    });
  }

  if (
    input.messageKey === "place_selected" &&
    input.place &&
    previousState.resultCount !== null
  ) {
    return Object.freeze({
      ...draft,
      message: `Essa é ${input.place}. Como você chegou até aqui pela nossa busca, posso te levar até lá ou mostrar mais informações primeiro.`,
      voiceCopy: `Essa é ${input.place}. Posso te levar até lá ou mostrar mais detalhes.`,
    });
  }

  if (
    input.messageKey === "online_restored" &&
    previousState.networkState === "offline"
  ) {
    return Object.freeze({
      ...draft,
      message:
        "Conexão de volta. Podemos continuar exatamente de onde paramos.",
      voiceCopy: "Conexão de volta. Podemos continuar.",
    });
  }

  if (
    input.messageKey === "navigation_active" &&
    input.place &&
    previousState.navigationPhase === "navigation_starting"
  ) {
    return Object.freeze({
      ...draft,
      message: `Rota pronta. Estamos a caminho de ${input.place}; continue seguindo o mapa.`,
      voiceCopy: `Estamos a caminho de ${input.place}.`,
    });
  }

  if (
    input.messageKey === "payment_approved" &&
    previousState.paymentState === "payment_started"
  ) {
    return Object.freeze({
      ...draft,
      message:
        "Pagamento confirmado. Sua compra está concluída e podemos continuar.",
      voiceCopy: "Pagamento confirmado. Compra concluída.",
    });
  }

  return Object.freeze({
    ...draft,
    message: sentence(draft.message),
  });
}
