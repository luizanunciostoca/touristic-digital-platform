import { describe, expect, it } from "vitest";

import { analyzeAssistantIntent } from "./intent-engine.js";

describe("assistant localized Search details commands", () => {
  it.each([
    ["Fale sobre Toca do Morcego", "pt"],
    ["Tell me more about Toca do Morcego", "en"],
    ["Detalles sobre Toca do Morcego", "es"],
    ["פרטים על Toca do Morcego", "he"],
  ] as const)("maps %s to more_info in %s", (input, language) => {
    expect(analyzeAssistantIntent(input)).toMatchObject({
      intent: "more_info",
      entities: {
        language,
        place: "toca do morcego",
      },
    });
  });
});
