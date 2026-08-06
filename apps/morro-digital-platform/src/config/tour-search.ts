import {
  getMorroTourById,
  type TourRouteContract,
} from "./tour-catalog.js";

function normalizeTourKeyword(keyword: string): string {
  return keyword
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function findMorroTourByKeyword(
  keyword: string,
): TourRouteContract | undefined {
  const normalized = normalizeTourKeyword(keyword);
  if (!normalized) return undefined;

  if (
    (normalized.includes("volta") && normalized.includes("ilha")) ||
    (normalized.includes("barco") && !normalized.includes("gamboa"))
  ) {
    return getMorroTourById("volta-a-ilha");
  }

  if (
    normalized.includes("gamboa") ||
    normalized.includes("argila") ||
    normalized.includes("trilha")
  ) {
    return getMorroTourById("trilha-gamboa");
  }

  if (
    normalized.includes("quadriciclo") ||
    normalized.includes("atv")
  ) {
    return getMorroTourById("passeio-quadriciclo");
  }

  return undefined;
}
