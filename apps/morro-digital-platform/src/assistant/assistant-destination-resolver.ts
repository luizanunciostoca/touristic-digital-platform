import {
  normalizeAssistantText,
  type AssistantNavigationDestination,
} from "@touristic/assistant";

export interface AssistantDestinationCatalogEntry extends AssistantNavigationDestination {
  readonly aliases?: readonly string[];
}

const V1_DESTINATIONS: readonly AssistantDestinationCatalogEntry[] =
  Object.freeze([
    {
      name: "Primeira Praia",
      latitude: -13.3776181,
      longitude: -38.9142193,
      category: "beaches",
      aliases: ["1a praia", "praia 1", "first beach"],
    },
    {
      name: "Segunda Praia",
      latitude: -13.3800508,
      longitude: -38.9118443,
      category: "beaches",
      aliases: ["2a praia", "praia 2", "second beach"],
    },
    {
      name: "Terceira Praia",
      latitude: -13.3839443,
      longitude: -38.9084472,
      category: "beaches",
      aliases: ["3a praia", "praia 3", "third beach"],
    },
    {
      name: "Quarta Praia",
      latitude: -13.3872014,
      longitude: -38.9052792,
      category: "beaches",
      aliases: ["4a praia", "praia 4", "fourth beach"],
    },
    {
      name: "Praia do Encanto",
      latitude: -13.4237732,
      longitude: -38.9059088,
      category: "beaches",
      aliases: [
        "quinta praia",
        "5a praia",
        "praia 5",
        "encanto",
        "fifth beach",
      ],
    },
    {
      name: "Praia de Garapuá",
      latitude: -13.4769538,
      longitude: -38.9165457,
      category: "beaches",
      aliases: ["garapua", "garapuá", "praia de garapua"],
    },
    {
      name: "Praia da Gamboa",
      latitude: -13.3933118,
      longitude: -38.9367387,
      category: "beaches",
      aliases: ["gamboa", "praia da gamboa do morro"],
    },
    {
      name: "Farol do Morro",
      latitude: -13.375917,
      longitude: -38.9153479,
      category: "attractions",
      aliases: ["farol", "lighthouse", "farol de morro de sao paulo"],
    },
    {
      name: "Toca do Morcego",
      latitude: -13.3766787,
      longitude: -38.9172057,
      category: "nightlife",
      aliases: ["toca", "morcego"],
    },
    {
      name: "Mirante da Tirolesa",
      latitude: -13.376294,
      longitude: -38.9147974,
      category: "attractions",
      aliases: ["mirante da tirolesa", "tirolesa", "trilha da tirolesa"],
    },
    {
      name: "Fortaleza de Morro de São Paulo",
      latitude: -13.3742327,
      longitude: -38.9159466,
      category: "attractions",
      aliases: [
        "fortaleza",
        "forte",
        "forte de tapirandu",
        "fortaleza de tapirandu",
        "fortaleza do tapirandu",
      ],
    },
    {
      name: "Piscinas Naturais de Garapuá",
      latitude: -13.4769538,
      longitude: -38.9165457,
      category: "attractions",
      aliases: ["piscinas de garapua", "piscina natural de garapua"],
    },
    {
      name: "Piscinas Naturais de Moreré",
      latitude: -13.5815787,
      longitude: -38.9859057,
      category: "attractions",
      aliases: [
        "morere",
        "moreré",
        "piscinas de morere",
        "piscina natural de morere",
      ],
    },
    {
      name: "Praia de Cueira",
      latitude: -13.585223,
      longitude: -38.932845,
      category: "beaches",
      aliases: ["cueira", "praia da cueira", "cueira boipeba"],
    },
    {
      name: "Boca da Barra e Rio do Inferno",
      latitude: -13.565432,
      longitude: -38.924567,
      category: "attractions",
      aliases: ["boca da barra", "rio do inferno"],
    },
    {
      name: "Canavieiras",
      latitude: -13.542198,
      longitude: -38.954321,
      category: "attractions",
      aliases: ["ostras em canavieiras", "criatorio de ostras"],
    },
    {
      name: "Cairu",
      latitude: -13.471562,
      longitude: -39.043215,
      category: "attractions",
      aliases: ["cairu sede", "cidade de cairu", "sede do municipio"],
    },
    {
      name: "Fonte Grande",
      latitude: -13.376543,
      longitude: -38.918765,
      category: "attractions",
      aliases: ["fonte grande morro", "fonte grande morro de sao paulo"],
    },
    {
      name: "Praia do Porto de Cima",
      latitude: -13.378912,
      longitude: -38.924567,
      category: "beaches",
      aliases: ["porto de cima", "praia porto de cima"],
    },
    {
      name: "Praia da Ponta da Pedra",
      latitude: -13.382145,
      longitude: -38.930123,
      category: "beaches",
      aliases: ["ponta da pedra", "praia ponta da pedra"],
    },
    {
      name: "Paredão de Argila",
      latitude: -13.388765,
      longitude: -38.934567,
      category: "attractions",
      aliases: ["argila", "paredao de argila", "banho de argila"],
    },
    {
      name: "Mirante do Zimbo",
      latitude: -13.418765,
      longitude: -38.915432,
      category: "attractions",
      aliases: ["zimbo", "mirante zimbo"],
    },
  ]);

function destinationKeys(
  entry: AssistantDestinationCatalogEntry,
): readonly string[] {
  return [entry.name, ...(entry.aliases ?? [])].map(normalizeAssistantText);
}

export function resolveMorroAssistantDestination(
  query: string,
): AssistantNavigationDestination | null {
  const normalizedQuery = normalizeAssistantText(query);
  if (!normalizedQuery) return null;

  const exact = V1_DESTINATIONS.find((entry) =>
    destinationKeys(entry).includes(normalizedQuery),
  );
  const matched =
    exact ??
    V1_DESTINATIONS.find((entry) =>
      destinationKeys(entry).some(
        (key) => normalizedQuery.includes(key) || key.includes(normalizedQuery),
      ),
    );

  if (!matched) return null;
  return Object.freeze({
    name: matched.name,
    latitude: matched.latitude,
    longitude: matched.longitude,
    category: matched.category ?? null,
  });
}

export function createMorroAssistantDestinationResolver() {
  return Object.freeze({
    resolveDestination: resolveMorroAssistantDestination,
  });
}

export const morroAssistantDestinationCatalog = V1_DESTINATIONS;
