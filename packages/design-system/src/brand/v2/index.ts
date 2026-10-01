import { brandTokensV2 } from "./tokens.js";

export const BRAND_FAMILY_V2_VERSION = "2.0.0" as const;
export const BRAND_FAMILY_V2_REFERENCE = "CONCEPT_02_APPROVED" as const;
export const TERRITORIAL_DESIGN_VALIDATION = "INTERNAL" as const;

export const brandFamilyV2 = Object.freeze({
  touristicDigitalPlatform: Object.freeze({
    id: "touristic-digital-platform",
    name: "Touristic Digital Platform",
    concept: "REDE",
    role: "MASTER_BRAND",
    assets: Object.freeze({
      symbol: "packages/design-system/src/brand/v2/assets/tdp-symbol.svg",
      micro: "packages/design-system/src/brand/v2/assets/tdp-micro.svg",
    }),
    sha256: Object.freeze({
      symbol: "b7761dc812ea364743762d6db3d25e548ed679c8a8630ca5f8fdc64a7e1bf511",
      micro: "020217dd135fc5c3a10aff648d0e4f6b4d5ea22f6f639be69443e6ed0b1b64d4",
    }),
  }),
  morroDigital: Object.freeze({
    id: "morro-digital",
    name: "Morro Digital",
    destination: "Morro de São Paulo",
    concept: "PERCURSO",
    role: "DESTINATION_BRAND",
    territorialValidation: TERRITORIAL_DESIGN_VALIDATION,
    assets: Object.freeze({
      symbol: "packages/design-system/src/brand/v2/assets/morro-symbol.svg",
      micro: "packages/design-system/src/brand/v2/assets/morro-micro.svg",
    }),
    sha256: Object.freeze({
      symbol: "df3e288adc113fb4b7440694b9bd796b9e7cd10ac6839286b05267cd2f3195be",
      micro: "014a6b0ad562fc43e730c2e89585f0bdad8bc5c021e37b13796c80a6ac0680ee",
    }),
  }),
  itacareDigital: Object.freeze({
    id: "itacare-digital",
    name: "Itacaré Digital",
    destination: "Itacaré",
    concept: "FLUXO",
    role: "DESTINATION_BRAND",
    territorialValidation: TERRITORIAL_DESIGN_VALIDATION,
    taglineStatus: "NEEDS_HUMAN_VALIDATION",
    assets: Object.freeze({
      symbol: "packages/design-system/src/brand/v2/assets/itacare-symbol.svg",
      micro: "packages/design-system/src/brand/v2/assets/itacare-micro.svg",
    }),
    sha256: Object.freeze({
      symbol: "1dd65603b552f4e00d47df5fe38ba2cbcc0827041f2fa7a36993779f22fcbc29",
      micro: "e6877246e709b4f32404b081620e0a9002484f5b13579779a47edb1ba852d598",
    }),
  }),
  tokens: brandTokensV2,
});

export type BrandFamilyV2 = typeof brandFamilyV2;
