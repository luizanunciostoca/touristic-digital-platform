// prettier-ignore
export const V1_ASSISTANT_BASELINE = {
  featureId: "FEATURE-0004",
  migrationId: "MIG-0006",
  legacyRepository: "luizidebook/morro-de-sao-paulo-digital",
  legacyCommit: "60746fd7fed97b805758b37adfdbe3bad2582bfe",
  legacyRoot: "js/assistant",

  canonicalMenu: [
    {
      value: "beaches",
      pt: "Praias",
      en: "Beaches",
      es: "Playas",
      he: "חופים",
    },
    {
      value: "restaurants",
      pt: "Restaurantes",
      en: "Restaurants",
      es: "Restaurantes",
      he: "מסעדות",
    },
    {
      value: "hotels",
      pt: "Pousadas",
      en: "Hotels",
      es: "Hoteles",
      he: "מלונות",
    },
    {
      value: "shops",
      pt: "Lojas",
      en: "Shops",
      es: "Tiendas",
      he: "חנויות",
    },
    {
      value: "transport",
      pt: "Transporte",
      en: "Transport",
      es: "Transporte",
      he: "תחבורה",
    },
    {
      value: "attractions",
      pt: "Atrações",
      en: "Attractions",
      es: "Atracciones",
      he: "אטרקציות",
    },
    {
      value: "tours",
      pt: "Passeios",
      en: "Tours",
      es: "Paseos",
      he: "סיורים",
    },
    {
      value: "nightlife",
      pt: "Vida Noturna",
      en: "Nightlife",
      es: "Vida Nocturna",
      he: "חיי לילה",
    },
    {
      value: "emergencies",
      pt: "Emergências",
      en: "Emergencies",
      es: "Emergencias",
      he: "מקרי חירום",
    },
    {
      value: "help",
      pt: "Ajuda",
      en: "Help",
      es: "Ayuda",
      he: "עזרה",
    },
  ],

  locales: ["pt", "en", "es", "he"],

  intentEngine: {
    localFirst: true,
    llmFallbackConfidenceBelow: 0.5,
    longInputThresholdChars: 90,
    modifiersSupported: true,
    keyIntents: [
      "navigate",
      "cancel_navigation",
      "open_now",
      "weather",
      "my_location",
      "photos",
      "price",
      "hours",
      "more_info",
      "nearby",
      "favorites",
      "help",
      "confirm",
      "deny",
      "greeting",
      "thanks",
    ],
  },

  state: {
    lastTopic: null,
    preferences: {
      favoriteBeach: null,
      favoriteRestaurant: null,
    },
    voiceGenderDefault: "female",
    voiceNameDefault: null,
  },

  integrations: {
    navigation: true,
    voiceSynthesis: true,
    multilingualVoice: true,
    aiApiRelation: "/api/ai/*",
    targetProviderBoundary: "same-origin-server",
    clientProviderSecretsAllowed: false,
  },

  sourceBlobs: {
    "js/assistant/assistant.js": "5550bece383c179df2388651e47ea0bef9299f31",
    "js/assistant/assistant-manager.js":
      "86cbc5f9b58aca6a055b1796060904e5d3db0fbd",
    "js/assistant/assistant-core.js":
      "46aa5a2b01d36662543d4f09cb7912d7b5bc627f",
    "js/assistant/assistant-dialog/assistant-dialog.js":
      "c680af540cbe3e145adb6fc1d6207b639196d8c7",
    "js/assistant/assistant-dialog/dialog.js":
      "5e847d5c7943a293f674f54db6233d553ac1aa28",
    "js/assistant/assistant-dialog/intent-engine.js":
      "60e22e095a486f66e9b2a7a020127ec523b076f9",
    "js/assistant/assistant-dialog/llm-fallback.js":
      "427c429afbc4dca078c7f7a82e85b46a3c9696ce",
    "js/assistant/assistant-dialog/proactive-suggestions.js":
      "708a8e88878a2b60069ae94c3bb6375ee7711a3d",
    "js/assistant/voice/assistant-speech.js":
      "c2c38923c4797e8f70bde5f1e0913fef678f5273",
    "js/assistant/voice/audioDatabase.js":
      "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
    "js/assistant/voice/enhancedVoice.js":
      "4b1dd348deb8cebec03b61577ca6e36f6aecce3c",
    "js/assistant/voice/hebrewVoiceSupport.js":
      "7b27c01629d1cdb910327ab3cd3cfaaafc9c56b8",
    "js/assistant/voice/premiumVoices.js":
      "54761cf8fb928fd2de28ddbac8a7945e901ee514",
    "js/assistant/voice/voice.js":
      "b5eccb11ce7d7e4b0b14af3e8c1a7e6cf00e23b6",
    "js/assistant/voice/voiceAssistant.js":
      "d4fea7ef044a2bb37f066f4f3f9dcee38dc2be4a",
    "js/assistant/voice/voiceSystem.js":
      "29b37abf5f17b88bb33121845da806bdbdda2fb0",
  },
} as const;

export type V1AssistantBaseline = typeof V1_ASSISTANT_BASELINE;
