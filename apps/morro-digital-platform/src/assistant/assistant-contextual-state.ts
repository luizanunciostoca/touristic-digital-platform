import type { AssistantExploreStateSnapshot } from "./assistant-menu-command-router.js";
import type { AssistantMessageDom } from "./assistant-message-dom.js";

export type AssistantContextualState =
  | "start"
  | "welcome"
  | "category_selected"
  | "filter_selected"
  | "results_found"
  | "no_results"
  | "place_selected"
  | "action_available"
  | "navigation_starting"
  | "navigation_active"
  | "arrival"
  | "book_tour"
  | "book_table"
  | "buy_ticket"
  | "payment_started"
  | "payment_approved"
  | "payment_declined"
  | "timeout"
  | "offline"
  | "provider_error"
  | "return"
  | "back"
  | "cancelled"
  | "geolocation_allowed"
  | "geolocation_denied";

export interface AssistantContextualCopy {
  readonly message: string;
  readonly cta: string | null;
  readonly errorFallback: string;
  readonly voiceCopy: string;
}

export interface AssistantContextualVariables {
  readonly category?: string | null;
  readonly place?: string | null;
  readonly count?: number | null;
}

export const ASSISTANT_CONTEXTUAL_STATE_MATRIX: Readonly<
  Record<AssistantContextualState, AssistantContextualCopy>
> = Object.freeze({
  start: copy(
    "Olá! Posso ajudar você a explorar Morro de São Paulo.",
    "Explorar",
  ),
  welcome: copy(
    "O que você gostaria de encontrar agora?",
    "Escolher categoria",
  ),
  category_selected: copy(
    "Categoria selecionada: {{category}}. Escolha um filtro para refinar os resultados.",
    "Ver filtros",
  ),
  filter_selected: copy(
    "Filtro aplicado. Estou atualizando os lugares disponíveis.",
    "Ver resultados",
  ),
  results_found: copy(
    "Encontrei {{count}} opções para você. Escolha um lugar para ver os detalhes.",
    "Ver lugares",
  ),
  no_results: copy(
    "Não encontrei resultados com esses critérios. Você pode voltar e ajustar os filtros.",
    "Alterar filtros",
  ),
  place_selected: copy(
    "{{place}} selecionado. Veja os detalhes e escolha a próxima ação.",
    "Ver ações",
  ),
  action_available: copy(
    "As ações disponíveis para {{place}} estão prontas.",
    "Escolher ação",
  ),
  navigation_starting: copy(
    "Preparando a rota até {{place}}.",
    "Iniciar navegação",
  ),
  navigation_active: copy(
    "Navegação ativa até {{place}}. Siga as orientações do mapa.",
    null,
  ),
  arrival: copy(
    "Você chegou a {{place}}. Posso ajudar com a próxima ação.",
    "Ver opções",
  ),
  book_tour: copy(
    "Vamos preparar a reserva do passeio com as opções disponíveis.",
    "Reservar passeio",
  ),
  book_table: copy(
    "Vamos preparar a reserva da mesa com os horários disponíveis.",
    "Reservar mesa",
  ),
  buy_ticket: copy(
    "Vamos preparar a compra do ingresso com os dados disponíveis.",
    "Comprar ingresso",
  ),
  payment_started: copy(
    "Pagamento iniciado com segurança. Aguarde a confirmação antes de sair desta etapa.",
    null,
  ),
  payment_approved: copy(
    "Pagamento aprovado. A confirmação da sua compra já está disponível.",
    "Ver confirmação",
  ),
  payment_declined: copy(
    "O pagamento não foi aprovado. Revise os dados ou tente outra forma de pagamento.",
    "Tentar novamente",
  ),
  timeout: copy(
    "A operação demorou mais do que o esperado. Você pode tentar novamente sem duplicar a solicitação.",
    "Tentar novamente",
  ),
  offline: copy(
    "Você está offline. Algumas informações salvas continuam disponíveis, mas ações online ficam pausadas.",
    null,
  ),
  provider_error: copy(
    "O serviço necessário está temporariamente indisponível. Tente novamente em instantes.",
    "Tentar novamente",
  ),
  return: copy(
    "Você voltou para a etapa anterior. Escolha como deseja continuar.",
    null,
  ),
  back: copy(
    "Voltamos uma etapa sem perder o contexto da sua busca.",
    null,
  ),
  cancelled: copy(
    "A ação foi cancelada. Você pode escolher outra opção quando quiser.",
    null,
  ),
  geolocation_allowed: copy(
    "Localização permitida. Agora posso usar sua posição para melhorar mapa e rotas.",
    null,
  ),
  geolocation_denied: copy(
    "Localização não permitida. Você ainda pode explorar e escolher lugares manualmente.",
    "Explorar sem localização",
  ),
});

function copy(message: string, cta: string | null): AssistantContextualCopy {
  return Object.freeze({
    message,
    cta,
    errorFallback: "Não foi possível concluir esta etapa. Tente novamente.",
    voiceCopy: message,
  });
}

function safeLabel(value: string | null | undefined, fallback: string): string {
  const normalized = String(value ?? "").trim().slice(0, 160);
  return normalized || fallback;
}

export function resolveAssistantContextualCopy(
  state: AssistantContextualState,
  variables: AssistantContextualVariables = {},
): AssistantContextualCopy {
  const template = ASSISTANT_CONTEXTUAL_STATE_MATRIX[state];
  const replacements = Object.freeze({
    category: safeLabel(variables.category, "esta categoria"),
    place: safeLabel(variables.place, "este lugar"),
    count: String(
      Number.isFinite(variables.count) && Number(variables.count) >= 0
        ? Math.trunc(Number(variables.count))
        : 0,
    ),
  });
  const interpolate = (value: string): string =>
    value.replace(
      /\{\{(category|place|count)\}\}/gu,
      (_, key: keyof typeof replacements) => replacements[key],
    );

  return Object.freeze({
    message: interpolate(template.message),
    cta: template.cta,
    errorFallback: interpolate(template.errorFallback),
    voiceCopy: interpolate(template.voiceCopy),
  });
}

export function resolveExploreContextualState(
  snapshot: AssistantExploreStateSnapshot,
): AssistantContextualState | null {
  if (snapshot.stage === "filters") return "category_selected";
  if (snapshot.stage === "places") {
    return snapshot.markerCount > 0 ? "results_found" : "no_results";
  }
  if (snapshot.stage === "detail") return "place_selected";
  if (snapshot.stage === "tour") return "action_available";
  if (snapshot.stage === "search") {
    return snapshot.markerCount > 0 ? "results_found" : "no_results";
  }
  if (snapshot.stage === "actions") return "action_available";
  return null;
}

export interface AssistantContextualMessagingOptions {
  readonly document: Document;
  readonly messages: AssistantMessageDom;
  readonly readExploreState: () => AssistantExploreStateSnapshot;
}

export interface AssistantContextualMessaging {
  publish(
    state: AssistantContextualState,
    variables?: AssistantContextualVariables,
  ): void;
  destroy(): void;
}

function eventDetail(event: Event): Record<string, unknown> | null {
  const detail = "detail" in event ? event.detail : null;
  return detail && typeof detail === "object"
    ? (detail as Record<string, unknown>)
    : null;
}

export function installAssistantContextualMessaging(
  options: AssistantContextualMessagingOptions,
): AssistantContextualMessaging {
  const view = options.document.defaultView;
  let destroyed = false;
  let previousExploreStage: string | null = null;
  let lastState: AssistantContextualState | null = null;

  const publish = (
    state: AssistantContextualState,
    variables: AssistantContextualVariables = {},
  ): void => {
    if (destroyed) return;
    const rendered = resolveAssistantContextualCopy(state, variables);
    options.document.getElementById("assistant-contextual-state")?.remove();
    options.messages.append({
      sender: "assistant",
      html: rendered.message,
      messageType: "contextual_state",
      id: "assistant-contextual-state",
      customClass: "assistant-contextual-state",
      avoidDuplicate: true,
      speak: true,
    });
    lastState = state;
  };

  const onExploreStateChanged = (): void => {
    const snapshot = options.readExploreState();
    if (
      previousExploreStage === "detail" &&
      (snapshot.stage === "places" || snapshot.stage === "filters")
    ) {
      publish("back");
    } else if (
      previousExploreStage !== null &&
      snapshot.stage === "menu" &&
      previousExploreStage !== "menu"
    ) {
      publish("return");
    } else {
      const state = resolveExploreContextualState(snapshot);
      if (state) {
        publish(state, {
          category: snapshot.category,
          place: snapshot.place,
          count: snapshot.markerCount,
        });
      }
    }
    previousExploreStage = snapshot.stage;
  };

  const onNavigationStarted = (event: Event): void => {
    const detail = eventDetail(event);
    publish("navigation_starting", {
      place: typeof detail?.destination === "string" ? detail.destination : null,
    });
  };
  const onNavigationStatusChanged = (event: Event): void => {
    const detail = eventDetail(event);
    if (detail?.phase === "active" || detail?.phase === "ui_ready") {
      publish("navigation_active", {
        place:
          typeof detail.destination === "string" ? detail.destination : null,
      });
    } else if (detail?.phase === "failed") {
      publish("provider_error");
    }
  };
  const onNavigationEnded = (event: Event): void => {
    const detail = eventDetail(event);
    publish(detail?.reason === "arrived" ? "arrival" : "cancelled", {
      place: typeof detail?.destination === "string" ? detail.destination : null,
    });
  };
  const onNetworkStateChanged = (event: Event): void => {
    const detail = eventDetail(event);
    if (detail?.state === "offline") {
      publish("offline");
      return;
    }
    if (detail?.state === "online" && lastState === "offline") {
      options.document.getElementById("assistant-contextual-state")?.remove();
      lastState = null;
    }
  };
  const onPaymentStarted = (): void => publish("payment_started");
  const onPaymentVerified = (): void => publish("payment_approved");
  const onPaymentFailed = (event: Event): void => {
    const detail = eventDetail(event);
    const code = typeof detail?.code === "string" ? detail.code : "";
    if (code === "PAYMENTS_BROWSER_CONFIRMATION_TIMEOUT") {
      publish("timeout");
    } else if (code === "PAYMENTS_BROWSER_PAYMENT_NOT_COMPLETED") {
      publish("payment_declined");
    } else {
      publish("provider_error");
    }
  };

  options.document.addEventListener(
    "morro:explore-state-changed",
    onExploreStateChanged,
  );
  options.document.addEventListener(
    "morro:network-state-changed",
    onNetworkStateChanged,
  );
  view?.addEventListener("navigationStarted", onNavigationStarted);
  view?.addEventListener("navigationStatusChanged", onNavigationStatusChanged);
  view?.addEventListener("navigationEnded", onNavigationEnded);
  view?.addEventListener("businessCheckoutRequested", onPaymentStarted);
  view?.addEventListener("businessPaymentVerified", onPaymentVerified);
  view?.addEventListener("businessPaymentVerificationFailed", onPaymentFailed);

  const map = options.document.getElementById("map");
  const observer =
    map && view?.MutationObserver
      ? new view.MutationObserver(() => {
          const state = map.getAttribute("data-geolocation-state");
          if (state === "granted") publish("geolocation_allowed");
          if (state === "denied") publish("geolocation_denied");
        })
      : null;
  observer?.observe(map as Node, {
    attributes: true,
    attributeFilter: ["data-geolocation-state"],
  });

  previousExploreStage = options.readExploreState().stage;

  return Object.freeze({
    publish,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      observer?.disconnect();
      options.document.removeEventListener(
        "morro:explore-state-changed",
        onExploreStateChanged,
      );
      options.document.removeEventListener(
        "morro:network-state-changed",
        onNetworkStateChanged,
      );
      view?.removeEventListener("navigationStarted", onNavigationStarted);
      view?.removeEventListener(
        "navigationStatusChanged",
        onNavigationStatusChanged,
      );
      view?.removeEventListener("navigationEnded", onNavigationEnded);
      view?.removeEventListener("businessCheckoutRequested", onPaymentStarted);
      view?.removeEventListener("businessPaymentVerified", onPaymentVerified);
      view?.removeEventListener(
        "businessPaymentVerificationFailed",
        onPaymentFailed,
      );
    },
  });
}
