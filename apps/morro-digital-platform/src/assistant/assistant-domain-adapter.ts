import {
  createAssistantDomainHandlers,
  createAssistantUserProfileManager,
  type AssistantDialogIntentHandler,
  type AssistantDialogResponse,
  type AssistantProfileStorage,
} from "@touristic/assistant";

export interface AssistantGeolocationPort {
  getCurrentPosition(
    success: PositionCallback,
    error?: PositionErrorCallback | null,
    options?: PositionOptions,
  ): void;
}

export interface AssistantBrowserDomainAdapterOptions {
  readonly storage?: AssistantProfileStorage;
  readonly geolocation?: AssistantGeolocationPort;
}

function getCurrentLocation(
  geolocation?: AssistantGeolocationPort,
): Promise<AssistantDialogResponse> {
  if (!geolocation) {
    return Promise.resolve({
      text: "Não consegui acessar sua localização neste dispositivo.",
      metadata: { domain: "my_location", state: "unavailable" },
    });
  }

  return new Promise((resolve) => {
    geolocation.getCurrentPosition(
      (position) => {
        resolve({
          text: "Localização atualizada com sucesso.",
          metadata: {
            domain: "my_location",
            state: "resolved",
            location: {
              lat: position.coords.latitude,
              lon: position.coords.longitude,
              accuracy: position.coords.accuracy,
            },
          },
        });
      },
      () => {
        resolve({
          text: "Não consegui obter sua localização. Verifique a permissão de localização e tente novamente.",
          metadata: { domain: "my_location", state: "denied_or_failed" },
        });
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 10_000 },
    );
  });
}

export function createAssistantBrowserDomainHandlers(
  options: AssistantBrowserDomainAdapterOptions = {},
): Partial<Record<string, AssistantDialogIntentHandler>> {
  const profile = createAssistantUserProfileManager(
    options.storage ? { storage: options.storage } : {},
  );

  return createAssistantDomainHandlers({
    ports: {
      weather: () => ({
        text: "A previsão do tempo ainda está sendo conectada à nova arquitetura.",
        metadata: { domain: "weather", state: "provider_pending" },
      }),
      myLocation: () => getCurrentLocation(options.geolocation),
      photos: (place) => ({
        text: `As fotos de ${place} ainda estão sendo conectadas à nova arquitetura.`,
        metadata: { domain: "photos", state: "provider_pending", place },
      }),
      price: (place) => ({
        text: `Os preços de ${place} ainda estão sendo conectados à nova arquitetura.`,
        metadata: { domain: "price", state: "provider_pending", place },
      }),
      hours: (place) => ({
        text: `Os horários de ${place} ainda estão sendo conectados à nova arquitetura.`,
        metadata: { domain: "hours", state: "provider_pending", place },
      }),
      moreInfo: (place) => ({
        text: `Os detalhes de ${place} ainda estão sendo conectados à nova arquitetura.`,
        metadata: { domain: "more_info", state: "provider_pending", place },
      }),
      nearby: () => ({
        text: "Para buscar lugares próximos, preciso da sua localização atual.",
        metadata: { domain: "nearby", state: "location_required" },
      }),
      favorites: () => {
        const favorites = profile.getFavoritePlaces();
        if (favorites.length === 0) {
          return {
            text: "Você ainda não adicionou lugares aos favoritos.",
            metadata: { domain: "favorites", count: 0 },
          };
        }
        return {
          text: `Seus favoritos: ${favorites.map((place) => place.name).join(", ")}.`,
          options: favorites.map((place) => ({
            label: place.name,
            value: place.name,
          })),
          metadata: { domain: "favorites", count: favorites.length },
        };
      },
      help: () => ({
        text: "Posso ajudar com praias, restaurantes, pousadas, atrações, passeios, vida noturna, localização, favoritos e rotas.",
        options: [
          { label: "Praias", value: "praias" },
          { label: "Restaurantes", value: "restaurantes" },
          { label: "Pousadas", value: "pousadas" },
          { label: "Atrações", value: "atrações" },
        ],
        metadata: { domain: "help" },
      }),
    },
  });
}
