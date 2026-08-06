import { describe, expect, it } from "vitest";
import { findMorroTourByKeyword } from "./tour-search.js";

describe("findMorroTourByKeyword", () => {
  it.each([
    ["volta à ilha", "volta-a-ilha"],
    ["passeio de barco", "volta-a-ilha"],
    ["Gamboa", "trilha-gamboa"],
    ["banho de argila", "trilha-gamboa"],
    ["trilha ecológica", "trilha-gamboa"],
    ["quadriciclo", "passeio-quadriciclo"],
    ["ATV", "passeio-quadriciclo"],
  ])("resolves %s to %s", (keyword, expectedTourId) => {
    expect(findMorroTourByKeyword(keyword)?.id).toBe(expectedTourId);
  });

  it("does not map Gamboa boat searches to Volta à Ilha", () => {
    expect(findMorroTourByKeyword("barco para Gamboa")?.id).toBe(
      "trilha-gamboa",
    );
  });

  it.each(["", "   ", "mergulho livre"])(
    "returns undefined for unsupported keyword %s",
    (keyword) => {
      expect(findMorroTourByKeyword(keyword)).toBeUndefined();
    },
  );
});
