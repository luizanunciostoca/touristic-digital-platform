const V1_PHOTO_BASE_PATH = "/images/fotos/";

const V1_PHOTO_CATALOG = {
  "Farol do Morro": ["farol_do_morro1.jpg", "farol_do_morro2.jpg", "farol_do_morro3.jpg"],
  "Fortaleza de Morro de São Paulo": ["fortaleza_de_morro1.jpg", "fortaleza_de_morro2.jpg", "fortaleza_de_morro3.jpg"],
  "Primeira Praia": ["primeira_praia1.jpg", "primeira_praia2.jpg", "primeira_praia3.jpg"],
  "Segunda Praia": ["segunda_praia1.jpg", "segunda_praia2.jpg", "segunda_praia3.jpg"],
  "Terceira Praia": ["terceira_praia1.jpg", "terceira_praia2.jpg", "terceira_praia3.jpg"],
  "Quarta Praia": ["quarta_praia1.jpg", "quarta_praia2.jpg", "quarta_praia3.jpg"],
  "Praia do Encanto": ["praia_do_encanto1.jpg", "praia_do_encanto2.jpg", "praia_do_encanto3.jpg"],
  "Praia do Pôrto": ["praia_do_porto1.jpg", "praia_do_porto2.jpg", "praia_do_porto3.jpg"],
  "Praia da Gamboa": ["praia_da_gamboa1.jpg", "praia_da_gamboa2.jpg", "praia_da_gamboa3.jpg"],
  "Toca do Morcego Festas": ["toca_do_morcego_festas1.jpg", "toca_do_morcego_festas2.jpg", "toca_do_morcego_festas3.jpg"],
  "Passeio de Barco para Gamboa": ["passeio_barco_gamboa1.jpg", "passeio_barco_gamboa2.jpg", "passeio_barco_gamboa3.jpg"],
} as const;

const V1_PHOTO_ALIASES: Readonly<Record<string, string>> = {
  toca: "Toca do Morcego Festas",
  farol: "Farol do Morro",
  fortaleza: "Fortaleza de Morro de São Paulo",
  primeira: "Primeira Praia",
  segunda: "Segunda Praia",
  terceira: "Terceira Praia",
  quarta: "Quarta Praia",
  encanto: "Praia do Encanto",
  porto: "Praia do Pôrto",
  gamboa: "Praia da Gamboa",
};

function normalizePhotoPlaceName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const NORMALIZED_PHOTO_CATALOG = Object.entries(V1_PHOTO_CATALOG).map(
  ([name, files]) => ({ name, normalized: normalizePhotoPlaceName(name), files }),
);

export interface AssistantPhotoSet {
  readonly place: string;
  readonly images: readonly string[];
}

export function resolveAssistantV1Photos(place: string): AssistantPhotoSet | null {
  const normalized = normalizePhotoPlaceName(place);
  if (!normalized) return null;

  let match = NORMALIZED_PHOTO_CATALOG.find((entry) => entry.normalized === normalized);
  match ??= NORMALIZED_PHOTO_CATALOG.find(
    (entry) => entry.normalized.includes(normalized) || normalized.includes(entry.normalized),
  );

  if (!match) {
    const alias = V1_PHOTO_ALIASES[normalized];
    if (alias) match = NORMALIZED_PHOTO_CATALOG.find((entry) => entry.name === alias);
  }

  match ??= NORMALIZED_PHOTO_CATALOG.find(
    (entry) => entry.normalized.startsWith(normalized) || normalized.startsWith(entry.normalized),
  );

  if (!match) {
    for (const word of normalized.split(" ")) {
      if (word.length < 3) continue;
      match = NORMALIZED_PHOTO_CATALOG.find((entry) => entry.normalized.includes(word));
      if (match) break;
    }
  }

  if (!match) return null;
  return {
    place: match.name,
    images: match.files.map((file) => `${V1_PHOTO_BASE_PATH}${file}`),
  };
}
