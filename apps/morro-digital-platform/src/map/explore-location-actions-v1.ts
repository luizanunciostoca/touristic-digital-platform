export type V1ExplorePlaceAction = "command" | "back-places";

export interface V1ExplorePlaceActionOption {
  readonly label: string;
  readonly value: string;
  readonly action: V1ExplorePlaceAction;
}

const command = (label: string, value: string): V1ExplorePlaceActionOption =>
  Object.freeze({ label, value, action: "command" as const });

const backToPlaces = (category: string): V1ExplorePlaceActionOption =>
  Object.freeze({
    label: "⬅️ Voltar",
    value: `[sub]${category}`,
    action: "back-places" as const,
  });

const GENERIC_PLACE_ACTIONS = Object.freeze([
  command("📍 Como chegar", "como chegar"),
  command("📸 Ver fotos", "ver fotos"),
  command("ℹ️ Mais informações", "mais detalhes"),
  command("❤️ Favoritar", "adicionar aos favoritos"),
]);

const CATEGORY_PLACE_ACTIONS: Readonly<
  Record<string, readonly V1ExplorePlaceActionOption[]>
> = Object.freeze({
  restaurants: Object.freeze([
    command("🍴 Cardápio", "cardápio"),
    command("📍 Como chegar", "como chegar"),
    command("📸 Ver fotos", "ver fotos"),
    command("📞 Contato", "contato"),
    command("Mais opções", "mais opções"),
    backToPlaces("restaurants"),
  ]),
  hotels: Object.freeze([
    command("🛏️ Ver quartos", "ver quartos"),
    command("📅 Reservar", "reservar"),
    command("📍 Como chegar", "como chegar"),
    command("📸 Fotos", "ver fotos"),
    command("Mais opções", "mais opções"),
    backToPlaces("hotels"),
  ]),
  beaches: Object.freeze([
    command("🌊 Condições da praia", "condições da praia"),
    command("📍 Como chegar", "como chegar"),
    command("📸 Fotos", "ver fotos"),
    command("ℹ️ Informações", "informações"),
    command("Mais opções", "mais opções"),
    backToPlaces("beaches"),
  ]),
  tours: Object.freeze([
    command("🎟️ Reservar passeio", "reservar passeio"),
    command("📍 Ponto de encontro", "ponto de encontro"),
    command("📸 Fotos", "ver fotos"),
    command("📞 Contato", "contato"),
    command("Mais opções", "mais opções"),
    backToPlaces("tours"),
  ]),
  transport: Object.freeze([
    command("🚕 Solicitar", "solicitar transporte"),
    command("📍 Localização", "localização"),
    command("💰 Tarifas", "tarifas"),
    command("📞 Contato", "contato"),
    command("Mais opções", "mais opções"),
    backToPlaces("transport"),
  ]),
});

export function getV1ExplorePlaceActionOptions(
  category: string,
): readonly V1ExplorePlaceActionOption[] {
  return CATEGORY_PLACE_ACTIONS[category] ?? GENERIC_PLACE_ACTIONS;
}
