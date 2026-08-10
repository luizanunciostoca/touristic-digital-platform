import { morroV1SearchEnrichmentPart1 } from "./morro-v1-search-enrichment-part-1.js";
import { morroV1SearchEnrichmentPart2 } from "./morro-v1-search-enrichment-part-2.js";
import { morroV1SearchEnrichmentPart3 } from "./morro-v1-search-enrichment-part-3.js";

export interface MorroV1SearchEnrichment {
  readonly category: string;
  readonly name: string;
  readonly area?: string;
  readonly tags?: readonly string[];
}

export const morroV1SearchEnrichment: readonly MorroV1SearchEnrichment[] =
  Object.freeze(
    [
      ...morroV1SearchEnrichmentPart1,
      ...morroV1SearchEnrichmentPart2,
      ...morroV1SearchEnrichmentPart3,
    ].map((item) =>
      Object.freeze({
        ...item,
        ...(item.tags ? { tags: Object.freeze([...item.tags]) } : {}),
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
