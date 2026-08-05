export const tokens = Object.freeze({
  color: {
    brand: '#0F766E',
    surface: '#FFFFFF',
    text: '#0F172A',
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { sm: 8, md: 12, lg: 20, pill: 999 },
});

export type DesignTokens = typeof tokens;
