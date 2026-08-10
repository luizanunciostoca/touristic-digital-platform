import { describe, expect, it } from "vitest";

import {
  createSearchIndex,
  filterSearchCatalog,
  normalizeSearchText,
  searchCatalog,
  type SearchCatalogItem,
} from "./index.js";

const catalog = Object.freeze([
  Object.freeze({
    name: "Primeira Praia",
    category: "beaches",
    aliases: Object.freeze(["1a praia", "first beach"]),
    tags: Object.freeze(["surf", "piscina_natural"]),
    area: "praia",
  }),
  Object.freeze({
    name: "Toca do Morcego",
    category: "attractions",
    aliases: Object.freeze(["toca", "morcego"]),
    tags: Object.freeze(["sunset", "vida_noturna"]),
    area: "praia",
  }),
  Object.freeze({
    name: "Café das Artes",
    category: "restaurants",
    aliases: Object.freeze(["cafe das artes"]),
    tags: Object.freeze(["cafe", "vila"]),
    area: "vila",
  }),
  Object.freeze({
    name: "Portaló",
    category: "hotels",
    aliases: Object.freeze(["portalo"]),
    tags: Object.freeze(["piscina", "vila"]),
    area: "vila",
  }),
  Object.freeze({
    name: "חוף",
    category: "beaches",
    area: "praia",
  }),
] satisfies readonly SearchCatalogItem[]);

describe("normalizeSearchText", () => {
  it("normalizes case, accents, punctuation and repeated whitespace", () => {
    expect(normalizeSearchText("  CAFÉ — do   MORCEGO! ")).toBe(
      "cafe do morcego",
    );
  });

  it("preserves Hebrew text", () => {
    expect(normalizeSearchText("חוף")).toBe("חוף");
  });
});

describe("filterSearchCatalog", () => {
  it("combines category, tag and area filters with deterministic AND semantics", () => {
    const results = filterSearchCatalog(catalog, {
      categories: ["restaurants"],
      tags: ["CAFÉ"],
      areas: ["VILA"],
    });

    expect(results.map((item) => item.name)).toEqual(["Café das Artes"]);
  });

  it("requires all requested tags", () => {
    expect(
      filterSearchCatalog(catalog, { tags: ["surf", "piscina natural"] }),
    ).toEqual([]);
    expect(
      filterSearchCatalog(catalog, { tags: ["surf", "piscina_natural"] }).map(
        (item) => item.name,
      ),
    ).toEqual(["Primeira Praia"]);
  });
});

describe("searchCatalog", () => {
  it("ranks exact canonical matches ahead of aliases and partial matches", () => {
    const source = Object.freeze([
      ...catalog,
      Object.freeze({
        name: "Toca Lounge",
        category: "nightlife",
        aliases: Object.freeze(["toca do morcego"]),
      }),
    ] satisfies readonly SearchCatalogItem[]);

    const results = searchCatalog(source, "Toca do Morcego");

    expect(results[0]?.item.name).toBe("Toca do Morcego");
    expect(results[0]?.matchType).toBe("exact");
    expect(results[1]?.item.name).toBe("Toca Lounge");
    expect(results[1]?.matchType).toBe("alias");
  });

  it("matches canonical names and aliases accent-insensitively", () => {
    expect(searchCatalog(catalog, "PORTALO")[0]).toMatchObject({
      matchType: "exact",
      item: { name: "Portaló" },
    });
    expect(searchCatalog(catalog, "first beach")[0]).toMatchObject({
      matchType: "alias",
      item: { name: "Primeira Praia" },
    });
    expect(searchCatalog(catalog, "café das artes")[0]).toMatchObject({
      matchType: "exact",
      item: { name: "Café das Artes" },
    });
  });

  it("matches tags and areas only after stronger name/alias modes", () => {
    expect(searchCatalog(catalog, "sunset")[0]).toMatchObject({
      matchType: "tag",
      item: { name: "Toca do Morcego" },
    });
    expect(
      searchCatalog(catalog, "vila").map((result) => result.matchType),
    ).toEqual(["tag", "tag"]);
  });

  it("returns an empty immutable result for blank queries", () => {
    const results = searchCatalog(catalog, "   ");
    expect(results).toEqual([]);
    expect(Object.isFrozen(results)).toBe(true);
  });

  it("applies filters before matching", () => {
    const results = searchCatalog(catalog, "toca", {
      categories: ["attractions"],
    });

    expect(results.map((result) => result.item.name)).toEqual([
      "Toca do Morcego",
    ]);
    expect(results[0]?.matchType).toBe("alias");
  });
});

describe("createSearchIndex", () => {
  it("takes an immutable array snapshot and exposes deterministic operations", () => {
    const mutable = [...catalog];
    const index = createSearchIndex(mutable);
    mutable.pop();

    expect(index.size).toBe(5);
    expect(index.all()).toHaveLength(5);
    expect(Object.isFrozen(index.all())).toBe(true);
    expect(index.search("first beach")[0]).toMatchObject({
      matchType: "alias",
      item: { name: "Primeira Praia" },
    });
  });
});
