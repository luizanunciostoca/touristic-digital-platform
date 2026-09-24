#!/usr/bin/env node
import { readFileSync } from "node:fs";

const publicCopyFiles = [
  "apps/morro-digital-platform/src/assistant/assistant-contextual-state.ts",
  "apps/morro-digital-platform/src/assistant/assistant-navigation-feedback.ts",
  "apps/morro-digital-platform/src/navigation/navigation-contextual-suggestions.ts",
];

const forbidden = [
  { pattern: /Categoria selecionada:/gu, label: "PT technical category status" },
  { pattern: /Selected category:/gu, label: "EN technical category status" },
  { pattern: /Categoría seleccionada:/gu, label: "ES technical category status" },
  { pattern: /הקטגוריה שנבחרה:/gu, label: "HE technical category status" },
  { pattern: /Ações disponíveis estão prontas/giu, label: "PT technical action status" },
  { pattern: /available actions .* are ready/giu, label: "EN technical action status" },
  { pattern: /acciones disponibles .* están listas/giu, label: "ES technical action status" },
  { pattern: /הפעולות הזמינות .* מוכנות/gu, label: "HE technical action status" },
  { pattern: /Navegação ativa/giu, label: "PT technical navigation status" },
  { pattern: /Navigation .* is active/giu, label: "EN technical navigation status" },
  { pattern: /La navegación .* está activa/giu, label: "ES technical navigation status" },
  { pattern: /הניווט .* פעיל/gu, label: "HE technical navigation status" },
  { pattern: /\bstate changed\b/giu, label: "internal state wording" },
  { pattern: /\bnavigation active\b/giu, label: "internal navigation wording" },
];

const violations = [];
for (const file of publicCopyFiles) {
  const source = readFileSync(file, "utf8");
  for (const rule of forbidden) {
    for (const match of source.matchAll(rule.pattern)) {
      const before = source.slice(0, match.index ?? 0);
      const line = before.split("\n").length;
      violations.push(`${file}:${line}: ${rule.label}: ${JSON.stringify(match[0])}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Assistant public copy quality check failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}
console.log("Assistant public copy quality check: PASS");
