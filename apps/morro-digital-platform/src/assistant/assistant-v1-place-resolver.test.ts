import { describe, expect, it } from "vitest";

import type { AssistantDestinationCatalogEntry } from "./assistant-destination-resolver.js";
import {
  assistantV1FuzzyThreshold,
  matchMorroAssistantDestinationV1,
  resolveMorroAssistantDestinationV1,
} from "./assistant-v1-place-resolver.js";

const precedenceFixture: readonly AssistantDestinationCatalogEntry[] = [
  {
    name: "Lugar Canônico",
    latitude: -13.38,
    longitude: -38.91,
    category: "attractions",
    aliases: ["apelido exclusivo"],
  },
];

const radiusFixture: readonly AssistantDestinationCatalogEntry[] = [
  {
    name: "Garapuá",
    latitude: -13.4769538,
    longitude: -38.9165457,
    category: "beaches",
    aliases: ["garapua limite"],
  },
  {
    name: "Moreré",
    latitude: -13.5815787,
    longitude: -38.9859057,
    category: "attractions",
    aliases: ["morere fora"],
  },
];

describe("V1 assistant place resolver semantics", () => {
  it("preserves the frozen V1 fuzzy threshold", () => {
    expect(assistantV1FuzzyThreshold).toBe(0.55);
  });

  it("prefers exact canonical-name matches", () => {
    expect(matchMorroAssistantDestinationV1("Basílico")?.matchType).toBe(
      "exact",
    );
  });

  it("treats accent-only variants as exact canonical matches like V1", () => {
    const match = matchMorroAssistantDestinationV1("basilico");
    expect(match?.matchType).toBe("exact");
    expect(match?.destination.name).toBe("Basílico");
  });

  it("resolves a true exact alias before partial matching", () => {
    const match = matchMorroAssistantDestinationV1(
      "apelido exclusivo",
      precedenceFixture,
    );
    expect(match?.matchType).toBe("alias");
    expect(match?.destination.name).toBe("Lugar Canônico");
  });

  it("supports canonical and alias inclusion in V1 precedence order", () => {
    expect(
      matchMorroAssistantDestinationV1("quero ir para toca do morcego")
        ?.matchType,
    ).toBe("partial");
    expect(
      matchMorroAssistantDestinationV1(
        "quero o apelido exclusivo agora",
        precedenceFixture,
      )?.matchType,
    ).toBe("alias_partial");
  });

  it("uses Dice fuzzy matching for V1-style typos", () => {
    const match = matchMorroAssistantDestinationV1("baslico");
    expect(match?.matchType).toBe("fuzzy");
    expect(match?.destination.name).toBe("Basílico");
    expect(match?.score).toBeGreaterThanOrEqual(0.55);
  });

  it("applies the V1 12km boundary before every match strategy", () => {
    expect(
      matchMorroAssistantDestinationV1("garapua limite", radiusFixture)
        ?.destination.name,
    ).toBe("Garapuá");
    expect(
      matchMorroAssistantDestinationV1("morere fora", radiusFixture),
    ).toBeNull();
    expect(
      matchMorroAssistantDestinationV1("Moreré", radiusFixture),
    ).toBeNull();
  });

  it("keeps Garapuá entries inside the source catalog boundary", () => {
    expect(resolveMorroAssistantDestinationV1("praia de garapuá")).toEqual({
      name: "Praia de Garapuá",
      latitude: -13.4769538,
      longitude: -38.9165457,
      category: "beaches",
    });
    expect(resolveMorroAssistantDestinationV1("garapua hotel")?.name).toBe(
      "Garapuá Praia Hotel",
    );
  });

  it("filters the real V1 out-of-radius source entry before matching", () => {
    expect(
      resolveMorroAssistantDestinationV1("Restaurante da Creusa"),
    ).toBeNull();
  });

  it("resolves newly migrated V1 categories through the runtime matcher", () => {
    expect(resolveMorroAssistantDestinationV1("cassi")?.name).toBe(
      "Cassi Turismo",
    );
    expect(resolveMorroAssistantDestinationV1("caiaque")?.name).toBe(
      "Passeio de Caiaque",
    );
    expect(resolveMorroAssistantDestinationV1("bombeiros")?.name).toBe(
      "Corpo de Bombeiros",
    );
  });

  it("preserves source order for duplicate canonical destinations", () => {
    expect(
      resolveMorroAssistantDestinationV1("Toca do Morcego")?.category,
    ).toBe("attractions");
    expect(
      resolveMorroAssistantDestinationV1("Farmácia Morro de São Paulo")
        ?.category,
    ).toBe("shops");
  });

  it("keeps unknown text unresolved instead of inventing coordinates", () => {
    expect(
      resolveMorroAssistantDestinationV1("destino totalmente inventado xyz"),
    ).toBeNull();
  });
});
