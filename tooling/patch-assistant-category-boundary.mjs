import { readFileSync, writeFileSync } from "node:fs";

const file = "packages/assistant/src/intent-engine.ts";
let source = readFileSync(file, "utf8");

const helperAnchor = `.trim();\n}\n\nconst SYNONYMS = {`;
if (!source.includes(helperAnchor)) {
  throw new Error("normalizeAssistantText helper anchor not found");
}
source = source.replace(
  helperAnchor,
  `.trim();\n}\n\nfunction includesNormalizedPhrase(normalized: string, candidate: string): boolean {\n  const phrase = normalizeAssistantText(candidate);\n  if (!phrase) return false;\n  return \` \${normalized} \`.includes(\` \${phrase} \`);\n}\n\nconst SYNONYMS = {`,
);

const categoryMatch = `keywords.some((keyword) =>\n        normalized.includes(normalizeAssistantText(keyword)),\n      )`;
if (!source.includes(categoryMatch)) {
  throw new Error("category keyword matcher anchor not found");
}
source = source.replace(
  categoryMatch,
  `keywords.some((keyword) => includesNormalizedPhrase(normalized, keyword))`,
);
writeFileSync(file, source);

const test = `import { describe, expect, it } from "vitest";\n\nimport {\n  analyzeAssistantIntent,\n  extractAssistantEntities,\n} from "./intent-engine.js";\n\ndescribe("assistant category phrase boundaries", () => {\n  it("does not classify barco as nightlife because it contains bar", () => {\n    expect(extractAssistantEntities("barco").category).toBe("tours");\n    expect(extractAssistantEntities("bar").category).toBe("nightlife");\n  });\n\n  it("keeps tour context for the V1 Volta à Ilha detail command", () => {\n    const input = "Fale sobre Passeio de Barco Volta à Ilha";\n    expect(extractAssistantEntities(input).category).toBe("tours");\n\n    const result = analyzeAssistantIntent(input);\n    expect(result.intent).toBe("more_info");\n    expect(result.entities.category).toBe("tours");\n  });\n});\n`;
writeFileSync("packages/assistant/src/intent-engine.category-boundary.test.ts", test);
