import type {
  AssistantDialogIntentHandler,
  AssistantDialogIntentHandlerContext,
  AssistantDialogResponse,
} from "./dialog-controller.js";
import type { AssistantIntent } from "./intent-engine.js";

export type AssistantDomainIntent =
  | "weather"
  | "my_location"
  | "photos"
  | "price"
  | "hours"
  | "more_info"
  | "nearby"
  | "favorites"
  | "help";

export interface AssistantDomainHandlerPorts {
  weather(
    request: AssistantDialogIntentHandlerContext,
  ): Promise<AssistantDialogResponse | null> | AssistantDialogResponse | null;
  myLocation(
    request: AssistantDialogIntentHandlerContext,
  ): Promise<AssistantDialogResponse | null> | AssistantDialogResponse | null;
  photos(
    place: string,
    request: AssistantDialogIntentHandlerContext,
  ): Promise<AssistantDialogResponse | null> | AssistantDialogResponse | null;
  price(
    place: string,
    request: AssistantDialogIntentHandlerContext,
  ): Promise<AssistantDialogResponse | null> | AssistantDialogResponse | null;
  hours(
    place: string,
    request: AssistantDialogIntentHandlerContext,
  ): Promise<AssistantDialogResponse | null> | AssistantDialogResponse | null;
  moreInfo(
    place: string,
    request: AssistantDialogIntentHandlerContext,
  ): Promise<AssistantDialogResponse | null> | AssistantDialogResponse | null;
  nearby(
    request: AssistantDialogIntentHandlerContext,
  ): Promise<AssistantDialogResponse | null> | AssistantDialogResponse | null;
  favorites(
    request: AssistantDialogIntentHandlerContext,
  ): Promise<AssistantDialogResponse | null> | AssistantDialogResponse | null;
  help(
    request: AssistantDialogIntentHandlerContext,
  ): Promise<AssistantDialogResponse | null> | AssistantDialogResponse | null;
}

export interface AssistantDomainHandlerCopy {
  askPlace(
    intent: Extract<
      AssistantDomainIntent,
      "photos" | "price" | "hours" | "more_info"
    >,
  ): AssistantDialogResponse;
}

export interface AssistantDomainHandlersOptions {
  ports: AssistantDomainHandlerPorts;
  copy?: Partial<AssistantDomainHandlerCopy>;
}

const DEFAULT_COPY: AssistantDomainHandlerCopy = {
  askPlace: (intent) => ({
    text:
      intent === "photos"
        ? "De qual local você quer ver fotos?"
        : intent === "price"
          ? "De qual local você quer saber o preço?"
          : intent === "hours"
            ? "De qual local você quer saber o horário?"
            : "Sobre qual local você quer mais informações?",
    metadata: { domain: intent, state: "awaiting_place" },
  }),
};

function resolvePlace(
  request: AssistantDialogIntentHandlerContext,
): string | null {
  return request.intent.entities.place ?? request.context.lastPlace ?? null;
}

function createPlaceHandler(
  intent: Extract<
    AssistantDomainIntent,
    "photos" | "price" | "hours" | "more_info"
  >,
  copy: AssistantDomainHandlerCopy,
  port: (
    place: string,
    request: AssistantDialogIntentHandlerContext,
  ) => Promise<AssistantDialogResponse | null> | AssistantDialogResponse | null,
): AssistantDialogIntentHandler {
  return async (request) => {
    const place = resolvePlace(request);
    if (!place) return copy.askPlace(intent);
    return port(place, request);
  };
}

export function createAssistantDomainHandlers(
  options: AssistantDomainHandlersOptions,
): Pick<
  Record<AssistantIntent, AssistantDialogIntentHandler>,
  AssistantDomainIntent
> {
  const copy: AssistantDomainHandlerCopy = { ...DEFAULT_COPY, ...options.copy };

  return Object.freeze({
    weather: (request) => options.ports.weather(request),
    my_location: (request) => options.ports.myLocation(request),
    photos: createPlaceHandler("photos", copy, (place, request) =>
      options.ports.photos(place, request),
    ),
    price: createPlaceHandler("price", copy, (place, request) =>
      options.ports.price(place, request),
    ),
    hours: createPlaceHandler("hours", copy, (place, request) =>
      options.ports.hours(place, request),
    ),
    more_info: createPlaceHandler("more_info", copy, (place, request) =>
      options.ports.moreInfo(place, request),
    ),
    nearby: (request) => options.ports.nearby(request),
    favorites: (request) => options.ports.favorites(request),
    help: (request) => options.ports.help(request),
  });
}
