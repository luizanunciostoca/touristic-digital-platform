import type { AssistantExploreStateSnapshot } from "./assistant-menu-command-router.js";
import type { AssistantMessageDom } from "./assistant-message-dom.js";
import { createAssistantConversationOrchestrator } from "./assistant-conversation-orchestrator.js";
import { composeConversationResponse } from "./assistant-conversation-response-composer.js";

export type AssistantContextualState =
  | "category_selected"
  | "results_found"
  | "no_results"
  | "place_selected"
  | "action_available"
  | "navigation_starting"
  | "navigation_active"
  | "payment_started"
  | "payment_approved"
  | "payment_declined"
  | "timeout"
  | "offline"
  | "online_restored"
  | "provider_error"
  | "geolocation_allowed"
  | "geolocation_denied";

export interface AssistantContextualCopy {
  readonly message: string;
  readonly cta: string | null;
  readonly errorFallback: string;
  readonly voiceCopy: string;
}

export type AssistantContextualLanguage = "pt" | "en" | "es" | "he";

export interface AssistantContextualVariables {
  readonly category?: string | null;
  readonly place?: string | null;
  readonly count?: number | null;
}

function copy(message: string, cta: string | null): AssistantContextualCopy {
  return Object.freeze({
    message,
    cta,
    errorFallback: "Não foi possível concluir esta etapa. Tente novamente.",
    voiceCopy: message,
  });
}

const CONTEXTUAL_COPY_BY_LANGUAGE: Readonly<
  Record<
    AssistantContextualLanguage,
    Readonly<Record<AssistantContextualState, AssistantContextualCopy>>
  >
> = Object.freeze({
  pt: Object.freeze({
    category_selected: copy(
      "{{category}}, ótima escolha. Quer ver todas as opções ou prefere filtrar primeiro?",
      "Ver filtros",
    ),
    results_found: copy(
      "Perfeito. Encontrei {{count}} opções para você. Quer escolher uma delas agora?",
      "Ver lugares",
    ),
    no_results: copy(
      "Não encontrei resultados com esses critérios. Você pode voltar e ajustar os filtros.",
      "Alterar filtros",
    ),
    place_selected: copy(
      "Essa é {{place}}. Posso te levar até lá ou você pode ver mais informações primeiro.",
      "Ver ações",
    ),
    action_available: copy(
      "O que você quer fazer em {{place}} agora?",
      "Ver opções",
    ),
    navigation_starting: copy(
      "Perfeito, vou preparar a rota para {{place}}.",
      "Iniciar navegação",
    ),
    navigation_active: copy(
      "Estamos a caminho de {{place}}. Continue seguindo o mapa.",
      null,
    ),
    payment_started: copy(
      "Tudo certo, o pagamento foi iniciado. Vou acompanhar a confirmação por aqui.",
      null,
    ),
    payment_approved: copy(
      "Pagamento confirmado. Sua compra está concluída.",
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
      "Parece que a conexão caiu. O que já carregou continua disponível; aviso quando voltarmos online.",
      null,
    ),
    online_restored: copy(
      "Conexão de volta. Podemos continuar de onde paramos.",
      null,
    ),
    provider_error: copy(
      "O serviço necessário está temporariamente indisponível. Tente novamente em instantes.",
      "Tentar novamente",
    ),
    geolocation_allowed: copy(
      "Perfeito, agora consigo ordenar os lugares pela sua posição.",
      null,
    ),
    geolocation_denied: copy(
      "Tudo bem. Você pode continuar explorando normalmente e escolher sua localização manualmente.",
      "Explorar sem localização",
    ),
  }),
  en: Object.freeze({
    category_selected: copy(
      "Selected category: {{category}}. Choose a filter to refine the results.",
      "View filters",
    ),
    results_found: copy(
      "I found {{count}} options for you. Choose a place to see its details.",
      "View places",
    ),
    no_results: copy(
      "I couldn’t find results with these criteria. Go back and adjust the filters.",
      "Change filters",
    ),
    place_selected: copy(
      "{{place}} selected. Review the details and choose the next action.",
      "View actions",
    ),
    action_available: copy(
      "The available actions for {{place}} are ready.",
      "Choose action",
    ),
    navigation_starting: copy(
      "Preparing the route to {{place}}.",
      "Start navigation",
    ),
    navigation_active: copy(
      "Navigation to {{place}} is active. Follow the map guidance.",
      null,
    ),
    payment_started: copy(
      "Payment started securely. Wait for confirmation before leaving this step.",
      null,
    ),
    payment_approved: copy(
      "Payment approved. Your purchase confirmation is now available.",
      "View confirmation",
    ),
    payment_declined: copy(
      "The payment was not approved. Review the details or try another payment method.",
      "Try again",
    ),
    timeout: copy(
      "The operation took longer than expected. You can try again without duplicating the request.",
      "Try again",
    ),
    offline: copy(
      "It looks like the connection dropped. What is already loaded remains available; I’ll let you know when we’re back online.",
      null,
    ),
    online_restored: copy(
      "We’re back online. We can continue from where we left off.",
      null,
    ),
    provider_error: copy(
      "The required service is temporarily unavailable. Try again shortly.",
      "Try again",
    ),
    geolocation_allowed: copy(
      "Location access allowed. I can now use your position to improve maps and routes.",
      null,
    ),
    geolocation_denied: copy(
      "Location access was not allowed. You can still explore and choose places manually.",
      "Explore without location",
    ),
  }),
  es: Object.freeze({
    category_selected: copy(
      "Categoría seleccionada: {{category}}. Elige un filtro para refinar los resultados.",
      "Ver filtros",
    ),
    results_found: copy(
      "Encontré {{count}} opciones para ti. Elige un lugar para ver los detalles.",
      "Ver lugares",
    ),
    no_results: copy(
      "No encontré resultados con estos criterios. Puedes volver y ajustar los filtros.",
      "Cambiar filtros",
    ),
    place_selected: copy(
      "{{place}} seleccionado. Revisa los detalles y elige la siguiente acción.",
      "Ver acciones",
    ),
    action_available: copy(
      "Las acciones disponibles para {{place}} están listas.",
      "Elegir acción",
    ),
    navigation_starting: copy(
      "Preparando la ruta hasta {{place}}.",
      "Iniciar navegación",
    ),
    navigation_active: copy(
      "La navegación hasta {{place}} está activa. Sigue las indicaciones del mapa.",
      null,
    ),
    payment_started: copy(
      "El pago se inició de forma segura. Espera la confirmación antes de salir de esta etapa.",
      null,
    ),
    payment_approved: copy(
      "Pago aprobado. La confirmación de tu compra ya está disponible.",
      "Ver confirmación",
    ),
    payment_declined: copy(
      "El pago no fue aprobado. Revisa los datos o prueba otro método de pago.",
      "Intentar de nuevo",
    ),
    timeout: copy(
      "La operación tardó más de lo esperado. Puedes intentarlo de nuevo sin duplicar la solicitud.",
      "Intentar de nuevo",
    ),
    offline: copy(
      "Parece que se perdió la conexión. Lo que ya cargó sigue disponible; te aviso cuando volvamos a estar en línea.",
      null,
    ),
    online_restored: copy(
      "La conexión volvió. Podemos continuar donde lo dejamos.",
      null,
    ),
    provider_error: copy(
      "El servicio necesario no está disponible temporalmente. Inténtalo de nuevo en unos instantes.",
      "Intentar de nuevo",
    ),
    geolocation_allowed: copy(
      "Ubicación permitida. Ahora puedo usar tu posición para mejorar mapas y rutas.",
      null,
    ),
    geolocation_denied: copy(
      "Ubicación no permitida. Aún puedes explorar y elegir lugares manualmente.",
      "Explorar sin ubicación",
    ),
  }),
  he: Object.freeze({
    category_selected: copy(
      "הקטגוריה שנבחרה: {{category}}. בחר מסנן כדי למקד את התוצאות.",
      "הצג מסננים",
    ),
    results_found: copy(
      "מצאתי {{count}} אפשרויות עבורך. בחר מקום כדי לראות פרטים.",
      "הצג מקומות",
    ),
    no_results: copy(
      "לא מצאתי תוצאות לפי הקריטריונים האלה. אפשר לחזור ולשנות את המסננים.",
      "שנה מסננים",
    ),
    place_selected: copy(
      "{{place}} נבחר. עיין בפרטים ובחר את הפעולה הבאה.",
      "הצג פעולות",
    ),
    action_available: copy(
      "הפעולות הזמינות עבור {{place}} מוכנות.",
      "בחר פעולה",
    ),
    navigation_starting: copy("מכין מסלול אל {{place}}.", "התחל ניווט"),
    navigation_active: copy(
      "הניווט אל {{place}} פעיל. עקוב אחר הנחיות המפה.",
      null,
    ),
    payment_started: copy(
      "התשלום התחיל בצורה מאובטחת. המתן לאישור לפני יציאה מהשלב.",
      null,
    ),
    payment_approved: copy("התשלום אושר. אישור הרכישה זמין כעת.", "הצג אישור"),
    payment_declined: copy(
      "התשלום לא אושר. בדוק את הפרטים או נסה אמצעי תשלום אחר.",
      "נסה שוב",
    ),
    timeout: copy(
      "הפעולה ארכה יותר מהצפוי. אפשר לנסות שוב בלי ליצור בקשה כפולה.",
      "נסה שוב",
    ),
    offline: copy(
      "נראה שהחיבור נותק. מה שכבר נטען עדיין זמין; אעדכן כשהחיבור יחזור.",
      null,
    ),
    online_restored: copy(
      "החיבור חזר. אפשר להמשיך מהמקום שבו עצרנו.",
      null,
    ),
    provider_error: copy(
      "השירות הנדרש אינו זמין זמנית. נסה שוב בעוד רגע.",
      "נסה שוב",
    ),
    geolocation_allowed: copy(
      "הגישה למיקום אושרה. כעת אפשר להשתמש במיקום שלך כדי לשפר מפות ומסלולים.",
      null,
    ),
    geolocation_denied: copy(
      "הגישה למיקום לא אושרה. עדיין אפשר לחקור ולבחור מקומות ידנית.",
      "חקור ללא מיקום",
    ),
  }),
});

export const ASSISTANT_CONTEXTUAL_STATE_MATRIX = CONTEXTUAL_COPY_BY_LANGUAGE.pt;

export function normalizeAssistantContextualLanguage(
  value: string | null | undefined,
): AssistantContextualLanguage {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  if (normalized === "es" || normalized.startsWith("es-")) return "es";
  if (normalized === "he" || normalized.startsWith("he-")) return "he";
  return "pt";
}

const CATEGORY_LABELS: Readonly<
  Record<AssistantContextualLanguage, Readonly<Record<string, string>>>
> = Object.freeze({
  pt: Object.freeze({
    beaches: "Praias",
    tours: "Passeios",
    attractions: "Atrações",
    restaurants: "Restaurantes",
    hotels: "Pousadas",
    nightlife: "Vida noturna",
    shops: "Lojas",
    transport: "Transporte",
    emergencies: "Emergências",
    help: "Ajuda",
  }),
  en: Object.freeze({
    beaches: "Beaches",
    tours: "Tours",
    attractions: "Attractions",
    restaurants: "Restaurants",
    hotels: "Hotels",
    nightlife: "Nightlife",
    shops: "Shops",
    transport: "Transport",
    emergencies: "Emergencies",
    help: "Help",
  }),
  es: Object.freeze({
    beaches: "Playas",
    tours: "Paseos",
    attractions: "Atracciones",
    restaurants: "Restaurantes",
    hotels: "Alojamientos",
    nightlife: "Vida nocturna",
    shops: "Tiendas",
    transport: "Transporte",
    emergencies: "Emergencias",
    help: "Ayuda",
  }),
  he: Object.freeze({
    beaches: "חופים",
    tours: "סיורים",
    attractions: "אטרקציות",
    restaurants: "מסעדות",
    hotels: "לינה",
    nightlife: "חיי לילה",
    shops: "חנויות",
    transport: "תחבורה",
    emergencies: "חירום",
    help: "עזרה",
  }),
});

export function resolveAssistantContextualCategoryLabel(
  value: string | null | undefined,
  language: AssistantContextualLanguage,
): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  return CATEGORY_LABELS[language][normalized] ?? normalized;
}

function safeLabel(value: string | null | undefined, fallback: string): string {
  const normalized = String(value ?? "")
    .trim()
    .slice(0, 160);
  return normalized || fallback;
}

const CONTEXTUAL_ERROR_FALLBACK: Readonly<
  Record<AssistantContextualLanguage, string>
> = Object.freeze({
  pt: "Não foi possível concluir esta etapa. Tente novamente.",
  en: "I couldn’t complete this step. Please try again.",
  es: "No fue posible completar esta etapa. Inténtalo de nuevo.",
  he: "לא ניתן היה להשלים את השלב הזה. נסה שוב.",
});

export function resolveAssistantContextualCopy(
  state: AssistantContextualState,
  variables: AssistantContextualVariables = {},
  language: AssistantContextualLanguage = "pt",
): AssistantContextualCopy {
  const template = CONTEXTUAL_COPY_BY_LANGUAGE[language][state];
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
    errorFallback: interpolate(CONTEXTUAL_ERROR_FALLBACK[language]),
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
  readonly resolveNavigationDestination?: (
    candidate: string | null,
  ) => string | null;
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
  let lastGlobalState: AssistantContextualState | null = null;
  let networkOffline = false;
  const conversation = createAssistantConversationOrchestrator();

  const language = (): AssistantContextualLanguage =>
    normalizeAssistantContextualLanguage(options.document.documentElement.lang);

  const nodeId = (area: "messages" | "navigation"): string =>
    area === "navigation"
      ? "assistant-navigation-contextual-state"
      : "assistant-contextual-state";

  const applyMetadata = (
    node: HTMLElement,
    state: AssistantContextualState,
    rendered: AssistantContextualCopy,
  ): void => {
    node.dataset.contextualState = state;
    if (rendered.cta) node.dataset.contextualCta = rendered.cta;
    else delete node.dataset.contextualCta;
    node.dataset.contextualVoiceCopy = rendered.voiceCopy;

    const nonBlocking =
      state === "geolocation_allowed" ||
      state === "geolocation_denied" ||
      state === "offline";
    if (nonBlocking) node.dataset.contextualNonBlocking = "true";
    else delete node.dataset.contextualNonBlocking;
  };

  const publish = (
    state: AssistantContextualState,
    variables: AssistantContextualVariables = {},
    area: "messages" | "navigation" = "messages",
  ): void => {
    if (destroyed) return;
    if (
      area === "messages" &&
      networkOffline &&
      (state === "geolocation_allowed" || state === "geolocation_denied")
    ) {
      return;
    }

    const resolvedLanguage = language();
    const draft = resolveAssistantContextualCopy(
      state,
      variables,
      resolvedLanguage,
    );
    const rendered = composeConversationResponse({
      messageKey: state,
      language: resolvedLanguage,
      draft,
      previousState: conversation.snapshot(),
      ...(variables.category ? { category: variables.category } : {}),
      ...(variables.place ? { place: variables.place } : {}),
      ...(Number.isFinite(variables.count)
        ? { count: Number(variables.count) }
        : {}),
    });
    const turn = conversation.transition({
      cause: state,
      messageKey: state,
      renderedText: rendered.message,
      voiceText: rendered.voiceCopy,
      source: area === "navigation" ? "navigation" : "contextual",
      ...(variables.category ? { category: variables.category } : {}),
      ...(variables.place
        ? {
            place: variables.place,
            ...(state === "navigation_starting" ||
            state === "navigation_active"
              ? { navigationDestination: variables.place }
              : {}),
          }
        : {}),
      ...(Number.isFinite(variables.count)
        ? { resultCount: Number(variables.count) }
        : {}),
      ...(state === "offline"
        ? { networkState: "offline" as const }
        : state === "online_restored"
          ? { networkState: "online" as const }
          : {}),
      ...(state.startsWith("payment_")
        ? { paymentState: state }
        : {}),
      ...(state.startsWith("geolocation_")
        ? { locationPermission: state }
        : {}),
      ...(state.startsWith("navigation_")
        ? { navigationPhase: state, journey: "navigation" }
        : {}),
    });
    const id = nodeId(area);
    options.messages.append({
      sender: "assistant",
      area,
      html: turn.renderedText,
      messageType: "contextual_state",
      id,
      customClass:
        area === "navigation"
          ? "assistant-navigation-contextual-state"
          : "assistant-contextual-state",
      avoidDuplicate: false,
      speak: area !== "navigation",
      navigationActive: area === "navigation",
    });
    const created = options.document.getElementById(id);
    if (created instanceof HTMLElement) {
      applyMetadata(created, state, rendered);
      created.dataset.conversationTurnId = turn.id;
      if (turn.previousTurnId) {
        created.dataset.previousConversationTurnId = turn.previousTurnId;
      } else {
        delete created.dataset.previousConversationTurnId;
      }
      created.dataset.conversationCause = turn.cause;
      created.dataset.conversationMessageKey = turn.messageKey;
    }
    if (area === "messages") lastGlobalState = state;
  };

  const removeNavigationContext = (): void => {
    options.messages.removeById(nodeId("navigation"), "navigation");
  };

  const navigationDestination = (event: Event): string | null => {
    const detail = eventDetail(event);
    const raw =
      typeof detail?.destination === "string" ? detail.destination : null;
    return options.resolveNavigationDestination
      ? options.resolveNavigationDestination(raw)
      : raw;
  };

  const onNavigationStarted = (event: Event): void => {
    publish(
      "navigation_starting",
      { place: navigationDestination(event) },
      "navigation",
    );
  };

  const onNavigationStatusChanged = (event: Event): void => {
    const detail = eventDetail(event);
    if (detail?.phase === "active" || detail?.phase === "ui_ready") {
      publish(
        "navigation_active",
        { place: navigationDestination(event) },
        "navigation",
      );
    } else if (detail?.phase === "failed") {
      publish("provider_error", {}, "navigation");
    } else if (
      detail?.phase === "ended" ||
      detail?.phase === "arrived" ||
      detail?.phase === "idle"
    ) {
      removeNavigationContext();
    }
  };

  const onNavigationEnded = (): void => {
    // Completion feedback has a dedicated canonical presenter in
    // assistant-navigation-feedback.ts. Only clear the active navigation
    // contextual surface here so two presenters never compete.
    removeNavigationContext();
  };

  const onNetworkStateChanged = (event: Event): void => {
    const detail = eventDetail(event);
    if (detail?.state === "offline") {
      networkOffline = true;
      publish("offline");
      return;
    }
    if (detail?.state === "online") {
      networkOffline = false;
      if (lastGlobalState === "offline") {
        publish("online_restored");
      }
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

  return Object.freeze({
    publish,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      observer?.disconnect();
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
      options.messages.removeById(nodeId("messages"), "messages");
      options.messages.removeById(nodeId("navigation"), "navigation");
    },
  });
}
