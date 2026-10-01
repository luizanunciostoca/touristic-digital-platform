export const brandTokensV2 = Object.freeze({
  platform: Object.freeze({
    color: Object.freeze({
      ink: "#07152F",
      navy: "#0A2342",
      blueDark: "#07579E",
      blue: "#056FB5",
      cyan: "#19B6D8",
      teal: "#0AACB0",
      green: "#5CBA71",
      coral: "#FA7951",
      surface: "#F7FAFC",
      white: "#FFFFFF",
      black: "#000000",
    }),
    geometry: Object.freeze({
      nodeDiameter: "24px",
      routeStroke: "5px",
      lineCap: "round",
    }),
    typography: Object.freeze({
      family: "Inter",
      wordmarkPrimaryWeight: 800,
      wordmarkSecondaryWeight: 400,
    }),
  }),
  destination: Object.freeze({
    morro: Object.freeze({
      concept: "PERCURSO",
      accent: Object.freeze({
        mango: "#FFAA24",
        bougainvillea: "#EA3C89",
        atlantic: "#08A7CF",
        cobalt: "#0867B2",
      }),
    }),
    itacare: Object.freeze({
      concept: "FLUXO",
      accent: Object.freeze({
        ocean: "#0877B9",
        river: "#0AAEAA",
        mata: "#2F9D65",
        deepMata: "#1D7F57",
      }),
    }),
  }),
  semantic: Object.freeze({
    success: "#16794B",
    warning: "#A55A00",
    error: "#B42318",
    info: "#07579E",
    humanNode: "#FA7951",
  }),
  surface: Object.freeze({
    light: "#FFFFFF",
    subtle: "#F7FAFC",
    dark: "#07152F",
  }),
  content: Object.freeze({
    primary: "#07152F",
    secondary: "#475467",
    inverse: "#FFFFFF",
  }),
});

export type BrandTokensV2 = typeof brandTokensV2;
