import { morroV1SearchEnrichmentPart1 } from "./morro-v1-search-enrichment-part-1.js";
import { morroV1SearchEnrichmentPart2 } from "./morro-v1-search-enrichment-part-2.js";
import { morroV1SearchEnrichmentPart3 } from "./morro-v1-search-enrichment-part-3.js";

export interface MorroV1SearchEnrichment {
  readonly category: string;
  readonly name: string;
  readonly area?: string;
  readonly tags?: readonly string[];
}

const rawMorroV1SearchEnrichment: readonly MorroV1SearchEnrichment[] = [
  ...morroV1SearchEnrichmentPart1,
  ...morroV1SearchEnrichmentPart2,
  ...morroV1SearchEnrichmentPart3,
] as readonly MorroV1SearchEnrichment[];

export const morroV1SearchEnrichment: readonly MorroV1SearchEnrichment[] =
  Object.freeze(
    rawMorroV1SearchEnrichment.map((item) =>
      Object.freeze<MorroV1SearchEnrichment>({
        category: item.category,
        name: item.name,
        ...(item.area ? { area: item.area } : {}),
        ...(item.tags ? { tags: Object.freeze(Array.from(item.tags)) } : {}),
      }),
    ),
  );

export function morroV1SearchCatalogKey(
  category: string,
  name: string,
): string {
  return `${category}\u0000${name}`;
}

export const morroV1SearchEnrichmentByKey = new Map(
  morroV1SearchEnrichment.map((item) => [
    morroV1SearchCatalogKey(item.category, item.name),
    item,
  ]),
);
