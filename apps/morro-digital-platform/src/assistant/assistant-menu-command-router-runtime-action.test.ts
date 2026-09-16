import { describe, expect, it } from "vitest";

import { resolveAssistantRuntimeAction } from "./assistant-menu-command-router.js";

describe("assistant allowlisted runtime action mapping", () => {
  it("maps category and place actions to the typed Explore command contract", () => {
    expect(resolveAssistantRuntimeAction("show_category:beaches")).toEqual({
      type: "open_category",
      category: "beaches",
    });
    expect(resolveAssistantRuntimeAction("show_place:Primeira Praia")).toEqual({
      type: "select_place",
      place: "Primeira Praia",
    });
  });

  it("rejects actions outside the strict runtime vocabulary", () => {
    expect(resolveAssistantRuntimeAction("navigate:Primeira Praia")).toBeNull();
    expect(resolveAssistantRuntimeAction("javascript:alert(1)")).toBeNull();
  });
});
