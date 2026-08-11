# Business M59 — Tutorial Profile Sandbox/Runtime Evidence

## Scope

M59 closes the frozen V1 Business tutorial profile sandbox contract without restoring the V1 global runtime coupling. The implementation reuses the existing V2 `BusinessProfile` core and only adds the onboarding-owned tutorial projection, preview and tutorial-only actions.

## Frozen V1 source

Repository: `luizidebook/morro-de-sao-paulo-digital`

Frozen commit: `60746fd7fed97b805758b37adfdbe3bad2582bfe`

Primary evidence:

- `js/onboarding/runtime/business-profile-sandbox.js`
- `js/onboarding/__tests__/business-profile-sandbox.test.js`
- `js/onboarding/runtime/business-live-runtime.js`
- `js/onboarding/runtime/PROFILE_SANDBOX_IMPLEMENTATION.md`

The frozen profile sandbox builds a temporary Business profile from onboarding context, sanitizes display data, reuses category/specialty/location/CTA, optionally includes a demonstration promotion, opens the profile and exposes map, primary and promotion actions. Tutorial activity is explicitly excluded from real Business metrics. The V1 test also proves that rating and opening-hours state must not be invented.

The same V1 module also imports partner-workspace and commercial-conversion behavior. Those responsibilities are intentionally not absorbed by M59; they remain separately classified contracts.

## Existing V2 dependency reused

M59 does not duplicate the Business profile model or sanitization rules.

The existing `@touristic/business` core already owns:

- immutable `BusinessProfile` and `BusinessPromotion` contracts;
- `normalizeBusinessProfile()` sanitization/defaults;
- protected Business profile read/save services;
- Auth-backed tenant authorization outside onboarding state.

The new `@touristic/business/onboarding-profile` adapter projects tutorial context into that existing profile core.

## M59 implementation

`buildBusinessTutorialProfile()` derives a temporary profile from Business onboarding state and delegates final normalization to `normalizeBusinessProfile()`.

The projection preserves:

- tutorial candidate/profile id when available;
- sanitized Business name;
- category label and specialty;
- bounded description and CTA defaults;
- confirmed location label and example/device-location disclosure;
- optional demonstration promotion;
- `tutorial: true`;
- `excludeFromBusinessMetrics: true`.

No rating or `openNow` field is introduced.

The module is exported through the explicit `@touristic/business/onboarding-profile` subpath and mapped by the real onboarding HTML import map.

## Runtime behavior

The app runtime loads the profile module lazily only when the frozen `profile` step is entered. This keeps unrelated route and discovery browser contracts from depending on the profile subpath.

On profile-step entry the runtime:

1. maps the selected category id to the frozen category label;
2. derives CTA/promotion data from existing tutorial context;
3. builds the normalized tutorial profile;
4. persists it as `tutorialBusinessProfile` in the onboarding runtime context;
5. emits `businessOnboardingProfileOpened` with tutorial/metric-exclusion metadata.

The onboarding surface renders an embedded profile preview from that persisted state rather than restoring the V1 global modal/view implementation.

The preview exposes the frozen observable action intents:

- `profile-map` → `businessTutorialProfileMapAction`;
- `profile-primary` → `businessTutorialProfilePrimaryAction`;
- `profile-promotion` → `businessTutorialProfilePromotionAction` when a promotion exists.

Every action is tutorial-only and explicitly excluded from Business metrics.

## Runtime-context boundary correction

During executable M59 validation, the browser contract exposed a fail-closed allowlist issue in `updateBusinessOnboardingRuntimeContext()`: the builder result was created correctly but `tutorialBusinessProfile` was not an allowed persisted runtime key.

The same audit found that the M58 keys `tutorialBusinessCandidate` and `businessRecommendationResult` were also absent from the explicit allowlist. M59 corrects this boundary by adding only those three known tutorial keys; it does not introduce arbitrary runtime-context writes.

`onboarding-context.test.ts` proves both sides of the boundary:

- the M58/M59 tutorial result keys persist;
- an unrelated credential-like key remains rejected.

This preserves the onboarding session as product/workflow state rather than authentication authority.

## Executable evidence

`onboarding-profile.test.ts` proves:

- sanitization through the shared Business profile core;
- category, specialty, CTA and location projection;
- optional promotion preservation;
- no fabricated rating/opening-hours state;
- tutorial metric exclusion.

`onboarding-context.test.ts` proves the explicit M58/M59 runtime allowlist and rejection of unauthorized keys.

The permanent `Business Onboarding Profile Browser Contract` proves in Chromium:

- the profile subpath resolves through the built browser module graph, including the existing Auth dependency of the Business core;
- the runtime creates and persists the tutorial profile on the `profile` step;
- sanitized `Toca do Morcego`, `Casa de eventos`, `Sunset`, CTA and location appear in the embedded preview;
- the optional demonstration promotion is preserved;
- rating/opening-hours state is absent;
- map, primary and promotion controls are rendered;
- opening and all three actions emit tutorial-only events with `excludeFromBusinessMetrics: true`.

The M59-specific Chromium contract passed on candidate head `22dc93b74bc57a89535393dddf5745f598c4e4dd` after the runtime-context boundary correction.

## Ownership boundary

M59 owns only Business onboarding tutorial profile projection/state/action intent.

It does not:

- create a second production Business profile model;
- duplicate Auth/tenant authorization;
- restore global V1 browser state;
- implement partner workspace;
- implement commercial conversion;
- execute payments/checkout;
- invent analytics endpoints;
- claim production recommendation ownership.

## Migration decision

M59 is sufficient to promote `Profile sandbox/runtime` from `GAP` to `PASS` once the final permanent PR head is green.

`Business profile behavior` remains `PARTIAL` because broader production persistence/profile breadth is outside this tutorial sandbox milestone.

`Live Business runtime` remains `PARTIAL` because partner workspace, analytics and other frozen runtime breadth are still incomplete.

## Final merge rule

The merge decision requires the official Quality Gate plus Business Auth, Dashboard, Onboarding Adapter, Onboarding Browser, Onboarding Route, Onboarding Profile and Navigation Accessibility contracts to be green on the same permanent final head, with no temporary workflow left in the diff.
