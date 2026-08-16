export const V1_DESIGN_TOKEN_SOURCE = Object.freeze({
  repository: "luizidebook/morro-de-sao-paulo-digital",
  commit: "60746fd7fed97b805758b37adfdbe3bad2582bfe",
  path: "css/base/variables.css",
  gitBlobSha: "8686e390ef14db5de3dd84f6394f0c896160ff42",
});

export const v1CssVariables = Object.freeze({
  "--primary": "#3b82f6",
  "--primary-dark": "#2563eb",
  "--accent": "#10b981",
  "--accent-dark": "#059669",
  "--light": "#f9fafb",
  "--gray-100": "#f3f4f6",
  "--gray-200": "#e5e7eb",
  "--gray-300": "#d1d5db",
  "--gray-800": "#1f2937",
  "--shadow-sm": "0 1px 2px rgba(0, 0, 0, 0.05)",
  "--shadow":
    "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
  "--shadow-lg":
    "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
  "--radius-sm": "0.25rem",
  "--radius": "0.5rem",
  "--radius-lg": "0.75rem",
  "--font-sans":
    '"Poppins", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  "--font-size-xp": "clamp(0.65rem, 0.6rem + 0.15vw, 0.675rem)",
  "--font-size-xs": "clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem)",
  "--font-size-xo": "clamp(0.8rem, 0.75rem + 0.31vw, 0.925rem)",
  "--font-size-sm": "clamp(0.875rem, 0.8rem + 0.375vw, 1rem)",
  "--font-size-base": "clamp(1rem, 0.95rem + 0.25vw, 1.125rem)",
  "--font-size-lg": "clamp(1.125rem, 1.05rem + 0.375vw, 1.25rem)",
  "--font-size-xl": "clamp(1.25rem, 1.15rem + 0.5vw, 1.5rem)",
  "--font-size-2xl": "clamp(1.5rem, 1.4rem + 0.5vw, 1.75rem)",
  "--transition": "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
  "--header-height": "3.75rem",
  "--bp-mobile": "375px",
  "--bp-tablet": "768px",
  "--bp-desktop": "1024px",
  "--bp-ultrawide": "1280px",
  "--spacing-xs": "clamp(0.25rem, 0.2rem + 0.25vw, 0.5rem)",
  "--spacing-sm": "clamp(0.5rem, 0.4rem + 0.5vw, 0.75rem)",
  "--spacing-md": "clamp(0.75rem, 0.65rem + 0.5vw, 1rem)",
  "--spacing-lg": "clamp(1rem, 0.9rem + 0.5vw, 1.5rem)",
  "--spacing-xl": "clamp(1.5rem, 1.3rem + 1vw, 2rem)",
  "--z-base": "1",
  "--z-controls": "10",
  "--z-popup": "100",
  "--z-modal": "1000",
  "--z-overlay": "2000",
  "--z-highest": "9999",
});

export const v1Tokens = Object.freeze({
  color: Object.freeze({
    primary: v1CssVariables["--primary"],
    primaryDark: v1CssVariables["--primary-dark"],
    accent: v1CssVariables["--accent"],
    accentDark: v1CssVariables["--accent-dark"],
    light: v1CssVariables["--light"],
    gray100: v1CssVariables["--gray-100"],
    gray200: v1CssVariables["--gray-200"],
    gray300: v1CssVariables["--gray-300"],
    gray800: v1CssVariables["--gray-800"],
  }),
  shadow: Object.freeze({
    sm: v1CssVariables["--shadow-sm"],
    md: v1CssVariables["--shadow"],
    lg: v1CssVariables["--shadow-lg"],
  }),
  radius: Object.freeze({
    sm: v1CssVariables["--radius-sm"],
    md: v1CssVariables["--radius"],
    lg: v1CssVariables["--radius-lg"],
  }),
  typography: Object.freeze({
    fontSans: v1CssVariables["--font-sans"],
  }),
  fontSize: Object.freeze({
    xp: v1CssVariables["--font-size-xp"],
    xs: v1CssVariables["--font-size-xs"],
    xo: v1CssVariables["--font-size-xo"],
    sm: v1CssVariables["--font-size-sm"],
    base: v1CssVariables["--font-size-base"],
    lg: v1CssVariables["--font-size-lg"],
    xl: v1CssVariables["--font-size-xl"],
    x2l: v1CssVariables["--font-size-2xl"],
  }),
  motion: Object.freeze({
    transition: v1CssVariables["--transition"],
  }),
  layout: Object.freeze({
    headerHeight: v1CssVariables["--header-height"],
  }),
  breakpoint: Object.freeze({
    mobile: v1CssVariables["--bp-mobile"],
    tablet: v1CssVariables["--bp-tablet"],
    desktop: v1CssVariables["--bp-desktop"],
    ultrawide: v1CssVariables["--bp-ultrawide"],
  }),
  spacing: Object.freeze({
    xs: v1CssVariables["--spacing-xs"],
    sm: v1CssVariables["--spacing-sm"],
    md: v1CssVariables["--spacing-md"],
    lg: v1CssVariables["--spacing-lg"],
    xl: v1CssVariables["--spacing-xl"],
  }),
  zIndex: Object.freeze({
    base: Number(v1CssVariables["--z-base"]),
    controls: Number(v1CssVariables["--z-controls"]),
    popup: Number(v1CssVariables["--z-popup"]),
    modal: Number(v1CssVariables["--z-modal"]),
    overlay: Number(v1CssVariables["--z-overlay"]),
    highest: Number(v1CssVariables["--z-highest"]),
  }),
});

export type V1CssVariables = typeof v1CssVariables;
export type V1DesignTokens = typeof v1Tokens;
