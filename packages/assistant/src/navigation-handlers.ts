import type {
  AssistantDialogIntentHandler,
  AssistantDialogResponse,
} from "./dialog-controller.js";

export interface AssistantNavigationDestination {
  name: string;
  latitude: number;
  longitude: number;
  category?: string | null;
}

export interface AssistantNavigationHandlerPorts {
  resolveDestination(
    query: string,
  ):
    | Promise<AssistantNavigationDestination | null>
    | AssistantNavigationDestination
    | null;
  startNavigation(
    destination: AssistantNavigationDestination,
  ): Promise<void> | void;
  cancelNavigation(): Promise<void> | void;
}

export interface AssistantNavigationHandlerCopy {
  askDestination(): AssistantDialogResponse;
  destinationNotFound(query: string): AssistantDialogResponse;
  navigationConfirmationRequested(
    destination: AssistantNavigationDestination,
  ): AssistantDialogResponse;
  navigationStarted(
    destination: AssistantNavigationDestination,
  ): AssistantDialogResponse;
  navigationDeclined(
    destination: AssistantNavigationDestination,
  ): AssistantDialogResponse;
  navigationCancelled(): AssistantDialogResponse;
}

export interface AssistantNavigationHandlersOptions {
  ports: AssistantNavigationHandlerPorts;
  copy?: Partial<AssistantNavigationHandlerCopy>;
}

const DEFAULT_COPY: AssistantNavigationHandlerCopy = {
  askDestination: () => ({
    text: "Para onde você quer ir?",
    metadata: { navigation: "awaiting_destination" },
  }),
  destinationNotFound: (query) => ({
    text: `Não encontrei o destino ${query}.`,
    metadata: { navigation: "destination_not_found", query },
  }),
  navigationConfirmationRequested: (destination) => ({
    text: `Deseja iniciar a navegação até ${destination.name}?`,
    options: [
      { label: "Sim", value: "sim" },
      { label: "Não", value: "não" },
    ],
    metadata: {
      navigation: "awaiting_confirmation",
      destination: destination.name,
      pendingRoute: destination,
    },
  }),
  navigationStarted: (destination) => ({
    text: `Traçando rota até ${destination.name}.`,
    metadata: {
      navigation: "started",
      destination: destination.name,
      latitude: destination.latitude,
      longitude: destination.longitude,
    },
  }),
  navigationDeclined: (destination) => ({
    text: `Tudo bem. Não vou iniciar a navegação até ${destination.name}.`,
    metadata: {
      navigation: "declined",
      destination: destination.name,
    },
  }),
  navigationCancelled: () => ({
    text: "Navegação cancelada.",
    metadata: { navigation: "cancelled" },
  }),
};

function createCopy(
  overrides: Partial<AssistantNavigationHandlerCopy> | undefined,
): AssistantNavigationHandlerCopy {
  return { ...DEFAULT_COPY, ...overrides };
}

function isPendingDestination(
  value: unknown,
): value is AssistantNavigationDestination {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AssistantNavigationDestination>;
  return (
    typeof candidate.name === "string" &&
    candidate.name.trim().length > 0 &&
    typeof candidate.latitude === "number" &&
    Number.isFinite(candidate.latitude) &&
    candidate.latitude >= -90 &&
    candidate.latitude <= 90 &&
    typeof candidate.longitude === "number" &&
    Number.isFinite(candidate.longitude) &&
    candidate.longitude >= -180 &&
    candidate.longitude <= 180
  );
}

function pendingDestinationFromContext(
  context: Parameters<AssistantDialogIntentHandler>[0]["context"],
): AssistantNavigationDestination | null {
  if (context.awaiting?.type !== "confirmar_navegacao") return null;
  return isPendingDestination(context.pendingRoute)
    ? context.pendingRoute
    : null;
}

export function createAssistantNavigationHandlers(
  options: AssistantNavigationHandlersOptions,
): Pick<
  Record<
    "navigate" | "cancel_navigation" | "confirm" | "deny",
    AssistantDialogIntentHandler
  >,
  "navigate" | "cancel_navigation" | "confirm" | "deny"
> {
  const copy = createCopy(options.copy);

  const navigate: AssistantDialogIntentHandler = async ({
    intent,
    context,
  }) => {
    const query = intent.entities.place ?? context.lastPlace ?? null;
    if (!query) return copy.askDestination();

    const destination = await options.ports.resolveDestination(query);
    if (!destination) return copy.destinationNotFound(query);

    return copy.navigationConfirmationRequested(destination);
  };

  const confirm: AssistantDialogIntentHandler = async ({ context }) => {
    const destination = pendingDestinationFromContext(context);
    if (!destination) return null;
    await options.ports.startNavigation(destination);
    return copy.navigationStarted(destination);
  };

  const deny: AssistantDialogIntentHandler = ({ context }) => {
    const destination = pendingDestinationFromContext(context);
    return destination ? copy.navigationDeclined(destination) : null;
  };

  const cancelNavigation: AssistantDialogIntentHandler = async () => {
    await options.ports.cancelNavigation();
    return copy.navigationCancelled();
  };

  return Object.freeze({
    navigate,
    cancel_navigation: cancelNavigation,
    confirm,
    deny,
  });
}
