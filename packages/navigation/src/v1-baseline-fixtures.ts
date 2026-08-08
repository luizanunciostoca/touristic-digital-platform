export const V1_NAVIGATION_BASELINE_PROVENANCE = Object.freeze({
  repository: "luizidebook/morro-de-sao-paulo-digital",
  commit: "60746fd7fed97b805758b37adfdbe3bad2582bfe",
  geometrySource: Object.freeze({
    path: "js/navigation/navigationState/navigation-route-geometry.js",
    blobSha: "90d7b9a24c83f9bb3c9fbbefd853df46107f904f",
  }),
  geometryTest: Object.freeze({
    path: "js/navigation/navigationState/__tests__/navigation-route-geometry.test.js",
    blobSha: "f700c954cb791987c0fd124491bd0885e75f8e1c",
  }),
  sessionSource: Object.freeze({
    path: "js/navigation/navigationState/navigationSessionManager.js",
    blobSha: "1d769afad37efb349f629fceac0a483ca92fae45",
  }),
  sessionContractTest: Object.freeze({
    path: "js/navigation/navigationState/__tests__/navigation-session-contract.test.js",
    blobSha: "4df4fd6fe7924198a0139e3ba44e62540fa8e167",
  }),
  routingSource: Object.freeze({
    path: "js/navigation/navigationServices/routing-client.js",
    blobSha: "160dcf5478212f77267561d408a66156fa12ba8d",
  }),
  routingTest: Object.freeze({
    path: "js/navigation/navigationServices/__tests__/routing-client.test.js",
    blobSha: "81630629512ebf322e6ab96290bdf239d4fe3127",
  }),
});

export const V1_GEOMETRY_FIXTURES = Object.freeze({
  derivedMetrics: Object.freeze({
    coordinates: Object.freeze([
      Object.freeze([-38.92, -13.38] as const),
      Object.freeze([-38.919, -13.38] as const),
    ]),
  }),
  officialSummary: Object.freeze({
    coordinates: Object.freeze([
      Object.freeze([-38.92, -13.38] as const),
      Object.freeze([-38.919, -13.38] as const),
      Object.freeze([-38.918, -13.38] as const),
    ]),
    distance: 300,
    duration: 240,
    steps: Object.freeze([
      Object.freeze({ distance: 150, duration: 120, way_points: [0, 1] }),
      Object.freeze({ distance: 150, duration: 120, way_points: [1, 2] }),
    ]),
    start: Object.freeze({ latitude: -13.38, longitude: -38.92 }),
    middle: Object.freeze({ latitude: -13.38, longitude: -38.919 }),
  }),
  turnBearing: Object.freeze({
    coordinates: Object.freeze([
      Object.freeze([-38.92, -13.38] as const),
      Object.freeze([-38.919, -13.38] as const),
      Object.freeze([-38.919, -13.379] as const),
    ]),
    distance: 220,
    duration: 180,
    steps: Object.freeze([
      Object.freeze({ distance: 110, duration: 90, way_points: [0, 1] }),
      Object.freeze({ distance: 110, duration: 90, way_points: [1, 2] }),
    ]),
    beforeTurn: Object.freeze({ latitude: -13.38, longitude: -38.9198 }),
    afterTurn: Object.freeze({ latitude: -13.3798, longitude: -38.919 }),
  }),
  gpsJitter: Object.freeze({
    coordinates: Object.freeze([
      Object.freeze([-38.92, -13.38] as const),
      Object.freeze([-38.918, -13.38] as const),
    ]),
    distance: 300,
    duration: 240,
    forward: Object.freeze({ latitude: -13.38, longitude: -38.919 }),
    jitterBack: Object.freeze({ latitude: -13.38, longitude: -38.9194 }),
    maxBackwardProgress: 0.01,
  }),
  northBearing: Object.freeze({
    from: Object.freeze([-38.919, -13.38] as const),
    to: Object.freeze([-38.919, -13.379] as const),
    distanceMeters: 1250,
    durationSeconds: 3660,
    formattedDistance: "1.3 km",
    formattedDuration: "1h 1min",
  }),
});

export const V1_ROUTING_FIXTURES = Object.freeze({
  start: Object.freeze([-38.91, -13.38] as const),
  end: Object.freeze([-38.92, -13.39] as const),
  stringCoordinatePair: Object.freeze(["-38.91", "-13.38"] as const),
  invalidLongitudePair: Object.freeze([181, -13.38] as const),
  invalidRequestPair: Object.freeze([999, 0] as const),
  unsupportedRequest: Object.freeze({
    profile: "driving-car",
    language: "fr",
  }),
  normalizedRequest: Object.freeze({
    coordinates: Object.freeze([
      Object.freeze([-38.91, -13.38] as const),
      Object.freeze([-38.92, -13.39] as const),
    ]),
    profile: "foot-walking",
    language: "pt",
    instructions: true,
  }),
  sameOriginEndpoint: "/api/routing/directions",
  staticHostFallbackStatus: 405,
  backendUnavailable: Object.freeze({
    status: 503,
    code: "ROUTING_NOT_CONFIGURED",
    message: "Serviço indisponível.",
  }),
});
