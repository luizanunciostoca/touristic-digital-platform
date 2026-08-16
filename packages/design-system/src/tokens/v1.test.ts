import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { tokens } from "../index.js";
import { V1_DESIGN_TOKEN_SOURCE, v1CssVariables, v1Tokens } from "./v1.js";

const preservedVariablesUrl = new URL(
  "../../../../apps/morro-digital-platform/public/legacy/css/base/variables.css",
  import.meta.url,
);

function gitBlobSha(content: Buffer): string {
  const header = Buffer.from(`blob ${content.byteLength}\0`, "utf8");
  return createHash("sha1").update(header).update(content).digest("hex");
}

function normalizeCssValue(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function readCssVariables(css: string): Record<string, string> {
  const entries = [...css.matchAll(/(--[\w-]+):\s*([^;]+);/g)].flatMap(
    (match) => {
      const name = match[1];
      const value = match[2];
      if (!name || value === undefined) return [];
      return [[name, normalizeCssValue(value)] as const];
    },
  );

  return Object.fromEntries(entries);
}

describe("FEATURE-0007 V1 token contract", () => {
  it("is pinned to the frozen V1 variables source", async () => {
    const preserved = await readFile(preservedVariablesUrl);

    expect(V1_DESIGN_TOKEN_SOURCE).toEqual({
      repository: "luizidebook/morro-de-sao-paulo-digital",
      commit: "60746fd7fed97b805758b37adfdbe3bad2582bfe",
      path: "css/base/variables.css",
      gitBlobSha: "8686e390ef14db5de3dd84f6394f0c896160ff42",
    });
    expect(gitBlobSha(preserved)).toBe(V1_DESIGN_TOKEN_SOURCE.gitBlobSha);
  });

  it("extracts every custom property from the preserved V1 file", async () => {
    const css = await readFile(preservedVariablesUrl, "utf8");

    expect(readCssVariables(css)).toEqual(v1CssVariables);
    expect(Object.keys(v1CssVariables)).toHaveLength(41);
  });

  it("maps the preserved variables into semantic token groups", () => {
    expect(v1Tokens.color).toEqual({
      primary: "#3b82f6",
      primaryDark: "#2563eb",
      accent: "#10b981",
      accentDark: "#059669",
      light: "#f9fafb",
      gray100: "#f3f4f6",
      gray200: "#e5e7eb",
      gray300: "#d1d5db",
      gray800: "#1f2937",
    });
    expect(v1Tokens.radius).toEqual({
      sm: "0.25rem",
      md: "0.5rem",
      lg: "0.75rem",
    });
    expect(v1Tokens.breakpoint).toEqual({
      mobile: "375px",
      tablet: "768px",
      desktop: "1024px",
      ultrawide: "1280px",
    });
    expect(v1Tokens.zIndex).toEqual({
      base: 1,
      controls: 10,
      popup: 100,
      modal: 1000,
      overlay: 2000,
      highest: 9999,
    });
  });

  it("keeps the pre-existing bootstrap token API unchanged", () => {
    expect(tokens).toEqual({
      color: {
        brand: "#0F766E",
        surface: "#FFFFFF",
        text: "#0F172A",
      },
      spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
      radius: { sm: 8, md: 12, lg: 20, pill: 999 },
    });
  });
});
