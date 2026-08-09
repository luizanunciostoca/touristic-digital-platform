import {
  createAssistantNavigationHandlers,
  type AssistantNavigationDestination,
} from "@touristic/assistant";

import type { NavigationSessionBootstrap } from "../navigation/navigation-session-bootstrap.js";

export interface AssistantNavigationDestinationResolver {
  resolveDestination(
    query: string,
  ):
    | Promise<AssistantNavigationDestination | null>
    | AssistantNavigationDestination
    | null;
}

export interface AssistantNavigationAdapterOptions {
  readonly navigation: Pick<NavigationSessionBootstrap, "start" | "stop">;
  readonly resolver: AssistantNavigationDestinationResolver;
}

export function createAssistantNavigationAppHandlers(
  options: AssistantNavigationAdapterOptions,
) {
  return createAssistantNavigationHandlers({
    ports: {
      resolveDestination: (query) => options.resolver.resolveDestination(query),
      async startNavigation(destination) {
        await options.navigation.start({
          longitude: destination.longitude,
          latitude: destination.latitude,
        });
      },
      cancelNavigation() {
        options.navigation.stop();
      },
    },
  });
}
