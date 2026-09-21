export default {
  ignoreFiles: [
    "**/public/legacy/**",
    "**/public/styles.css",
    "**/public/v1-*.css",
    "**/public/business-*.css",
    "**/public/privacy-preferences.css",
  ],
  rules: {
    "block-no-empty": true,
    "color-no-invalid-hex": true,
    "declaration-block-no-duplicate-custom-properties": true,
    "declaration-block-no-duplicate-properties": [
      true,
      {
        ignore: ["consecutive-duplicates-with-different-values"],
      },
    ],
    "function-no-unknown": true,
    "media-feature-name-no-unknown": true,
    "property-no-unknown": true,
    "selector-pseudo-class-no-unknown": true,
    "selector-pseudo-element-no-unknown": true,
    "unit-no-unknown": true,
    "declaration-property-value-disallowed-list": {
      transition: ["/\\ball\\b/"],
      "z-index": ["/^-?\\d{3,}$/"],
    },
  },
  overrides: [
    {
      files: ["**/public/commerce.css", "**/public/ticketing.css"],
      rules: {
        "color-no-hex": true,
        "declaration-no-important": true,
        "declaration-property-unit-disallowed-list": {
          "font-size": ["px"],
        },
        "declaration-property-value-allowed-list": {
          "font-family": ["/^var\\(--md-font-family-sans\\)$/"],
        },
      },
    },
  ],
};
