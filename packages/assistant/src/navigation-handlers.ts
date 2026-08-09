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
  navigationStarted(destination: AssistantNavigationDestination): AssistantDialogResponse;
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
  navigationStarted: (destination) => ({
    text: `Traçando rota até ${destination.name}.`,
    metadata: {
      navigation: "started",
      destination: destination.name,
      latitude: destination.latitude,
      longitude: destination.longitude,
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

export function createAssistantNavigationHandlers(
  options: AssistantNavigationHandlersOptions,
): Pick<
  Record<"navigate" | "cancel_navigation", AssistantDialogIntentHandler>,
  "navigate" | "cancel_navigation"
> {
  const copy = createCopy(options.copy);

  const navigate: AssistantDialogIntentHandler = async ({ intent, context }) => {
    const query = intent.entities.place ?? context.lastPlace ?? null;
    if (!query) return copy.askDestination();

    const destination = await options.ports.resolveDestination(query);
    if (!destination) return copy.destinationNotFound(query);

    await options.ports.startNavigation(destination);
    return copy.navigationStarted(destination);
  };

  const cancelNavigation: AssistantDialogIntentHandler = async () => {
    await options.ports.cancelNavigation();
    return copy.navigationCancelled();
  };

  return Object.freeze({
    navigate,
    cancel_navigation: cancelNavigation,
  });
}
