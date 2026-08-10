import { describe, expect, it } from "vitest";

import {
  diceSearchSimilarity,
  morroV1SearchCatalog,
  searchCatalog,
  searchV1FuzzyThreshold,
  type SearchCatalogItem,
} from "./index.js";

const precedenceFixture: readonly SearchCatalogItem[] = [
  {
    name: "Lugar Canônico",
    category: "attractions",
    aliases: ["apelido exclusivo"],
    tags: ["mirante"],
    area: "vila",
  },
  {
    name: "Outro Lugar",
    category: "restaurants",
    aliases: ["outro apelido"],
    tags: ["jantar"],
    area: "praia",
  },
];

describe("Search V1 Dice fuzzy fallback", () => {
  it("preserves the frozen V1 threshold", () => {
    expect(searchV1FuzzyThreshold).toBe(0.55);
  });

  it("uses the same normalized Dice behavior for V1-style typos", () => {
    const score = diceSearchSimilarity("baslico", "Basílico");
    expect(score).toBeGreaterThanOrEqual(searchV1FuzzyThreshold);

    const [match] = searchCatalog(morroV1SearchCatalog, "baslico");
    expect(match?.matchType).toBe("fuzzy");
    expect(match?.item.name).toBe("Basílico");
    expect(match?.score).toBe(score);
  });

  it("never runs fuzzy ahead of deterministic matching", () => {
    expect(
      searchCatalog(precedenceFixture, "Lugar Canônico")[0]?.matchType,
    ).toBe("exact");
    expect(
      searchCatalog(precedenceFixture, "apelido exclusivo")[0]?.matchType,
    ).toBe("alias");
    expect(searchCatalog(precedenceFixture, "Lugar")[0]?.matchType).toBe(
      "name_prefix",
    );
    expect(searchCatalog(precedenceFixture, "mirante")[0]?.matchType).toBe(
      "tag",
    );
  });

  it("considers aliases during fuzzy fallback", () => {
    const [match] = searchCatalog(precedenceFixture, "apelido exclussivo");
    expect(match?.matchType).toBe("fuzzy");
    expect(match?.item.name).toBe("Lugar Canônico");
    expect(match?.score).toBeGreaterThanOrEqual(searchV1FuzzyThreshold);
  });

  it("rejects candidates below the V1 threshold", () => {
    expect(searchCatalog(precedenceFixture, "xyz totalmente distante")).toEqual(
      [],
    );
  });

  it("applies filters before fuzzy selection", () => {
    expect(
      searchCatalog(precedenceFixture, "lugar canonco", {
        categories: ["restaurants"],
      }),
    ).toEqual([]);

    const [match] = searchCatalog(precedenceFixture, "outro lugr", {
      categories: ["restaurants"],
    });
    expect(match?.item.name).toBe("Outro Lugar");
    expect(match?.matchType).toBe("fuzzy");
  });
});
