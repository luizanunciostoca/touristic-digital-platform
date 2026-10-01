import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  BRAND_FAMILY_V2_REFERENCE,
  BRAND_FAMILY_V2_VERSION,
  TERRITORIAL_DESIGN_VALIDATION,
  brandFamilyV2,
} from "./index.js";
import { brandTokensV2 } from "./tokens.js";

const assets = [
  ["touristicDigitalPlatform", "symbol", "assets/tdp-symbol.svg"],
  ["touristicDigitalPlatform", "micro", "assets/tdp-micro.svg"],
  ["morroDigital", "symbol", "assets/morro-symbol.svg"],
  ["morroDigital", "micro", "assets/morro-micro.svg"],
  ["itacareDigital", "symbol", "assets/itacare-symbol.svg"],
  ["itacareDigital", "micro", "assets/itacare-micro.svg"],
] as const;

describe("Master Brand + Destination Brand System V2", () => {
  it("pins the approved Concept 02 authority and validation status", () => {
    expect(BRAND_FAMILY_V2_VERSION).toBe("2.0.0");
    expect(BRAND_FAMILY_V2_REFERENCE).toBe("CONCEPT_02_APPROVED");
    expect(TERRITORIAL_DESIGN_VALIDATION).toBe("INTERNAL");
  });

  it("keeps the human node distinct from product status colors", () => {
    expect(brandTokensV2.platform.color.coral).toBe("#FA7951");
    expect(brandTokensV2.semantic.humanNode).toBe("#FA7951");
    expect(brandTokensV2.semantic.success).not.toBe(
      brandTokensV2.semantic.humanNode,
    );
    expect(brandTokensV2.semantic.error).not.toBe(
      brandTokensV2.semantic.humanNode,
    );
  });

  it.each(assets)(
    "pins %s %s vector bytes and forbids live text",
    async (brand, variant, relativePath) => {
      const svg = await readFile(new URL(relativePath, import.meta.url), "utf8");
      const digest = createHash("sha256").update(svg).digest("hex");

      expect(digest).toBe(brandFamilyV2[brand].sha256[variant]);
      expect(svg).toContain("<svg");
      expect(svg).toContain("<path");
      expect(svg).not.toContain("<text");
      expect(svg).not.toContain('stroke-width="0"');
    },
  );

  it("uses independently simplified micro artwork", async () => {
    for (const [fullName, microName] of [
      ["tdp-symbol.svg", "tdp-micro.svg"],
      ["morro-symbol.svg", "morro-micro.svg"],
      ["itacare-symbol.svg", "itacare-micro.svg"],
    ] as const) {
      const full = await readFile(
        new URL(`assets/${fullName}`, import.meta.url),
        "utf8",
      );
      const micro = await readFile(
        new URL(`assets/${microName}`, import.meta.url),
        "utf8",
      );

      expect(micro).not.toBe(full);
      expect(micro).toContain('stroke-width="7.0"');
    }
  });
});
