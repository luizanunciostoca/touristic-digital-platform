import { readFileSync, writeFileSync } from "node:fs";

const engineFile = "packages/assistant/src/intent-engine.ts";
let engine = readFileSync(engineFile, "utf8");
const entityAnchor = `  const entities = extractAssistantEntities(input, normalized);\n  const modifiers = detectAssistantModifiers(normalized);`;
if (!engine.includes(entityAnchor)) {
  throw new Error("intent entity anchor not found");
}
engine = engine.replace(
  entityAnchor,
  `  const entities = extractAssistantEntities(input, normalized);\n  const contextualPlace = context.lastPlace?.trim();\n  if (\n    contextualPlace &&\n    includesNormalizedPhrase(normalized, contextualPlace)\n  ) {\n    entities.place = contextualPlace;\n  }\n  const modifiers = detectAssistantModifiers(normalized);`,
);
writeFileSync(engineFile, engine);

const testFile = "packages/assistant/src/intent-engine.category-boundary.test.ts";
let test = readFileSync(testFile, "utf8");
const closeAnchor = `  it("keeps tour context for the V1 Volta à Ilha detail command", () => {\n    const input = "Fale sobre Passeio de Barco Volta à Ilha";\n    expect(extractAssistantEntities(input).category).toBe("tours");\n\n    const result = analyzeAssistantIntent(input);\n    expect(result.intent).toBe("more_info");\n    expect(result.entities.category).toBe("tours");\n  });\n});`;
if (!test.includes(closeAnchor)) {
  throw new Error("category boundary test anchor not found");
}
test = test.replace(
  closeAnchor,
  `  it("keeps tour context for the V1 Volta à Ilha detail command", () => {\n    const input = "Fale sobre Passeio de Barco Volta à Ilha";\n    expect(extractAssistantEntities(input).category).toBe("tours");\n\n    const result = analyzeAssistantIntent(input);\n    expect(result.intent).toBe("more_info");\n    expect(result.entities.category).toBe("tours");\n  });\n\n  it("prefers the exact selected place over a nested generic place name", () => {\n    const result = analyzeAssistantIntent(\n      "Fale sobre Píer de Morro de São Paulo",\n      {\n        lastPlace: "Píer de Morro de São Paulo",\n        lastCategory: "transport",\n      },\n    );\n\n    expect(result.intent).toBe("more_info");\n    expect(result.entities.place).toBe("Píer de Morro de São Paulo");\n  });\n});`,
);
writeFileSync(testFile, test);
