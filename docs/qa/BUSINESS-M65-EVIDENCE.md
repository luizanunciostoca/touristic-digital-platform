# BUSINESS M65 — Live Runtime Semantic Parity Evidence

## Frozen sources

- V2 base: `luizidebook/touristic-digital-platform@375250a8422a141d03052e168c1f903d973193c5`
- V1: `luizidebook/morro-de-sao-paulo-digital@60746fd7fed97b805758b37adfdbe3bad2582bfe`
- Frozen V1 runtime: `js/onboarding/runtime/business-live-runtime.js`
- Permanent executable evidence: Business Live Runtime Browser Contract

## Frozen responsibility audit

The frozen V1 live runtime mixed Business onboarding orchestration with direct browser/global integrations. Its observable responsibilities are decomposed in V2 rather than restored as a monolith.

Already-owned capabilities remain delegated to their V2 owners:

- Search/discovery stays behind the Business discovery adapter and `@touristic/search`;
- Assistant remains behind the existing Business Assistant adapter;
- Navigation/route stays behind the explicit route and Navigation boundaries;
- profile projection and production profile view stay on the shared Business profile model;
- workspace/promotion remains the M60 sandbox workspace contract;
- commercial preparation remains the M61/M62 Business-to-Payments handoff;
- Auth/session/tenant authorization remains Auth-owned;
- payment execution and financial verification remain Payments-owned.

The remaining frozen live-runtime effects were presentation/focus responsibilities rather than missing production implementations. The V1 `notifications`, `analytics` and `partner-panel` branches focused existing surfaces; `reputation` delegated a question to the Assistant; `ecosystem` presented the resolved business again on the map.

## M65 implementation

M65 adds only the missing semantic orchestration to `BusinessOnboardingRuntime`:

- `arrival`, `map` and `ecosystem` emit a normalized live-business map presentation using the already resolved Business location;
- the corresponding conversation presentation preserves the V1 place actions `Informações`, `Como chegar` and `Ver perfil completo`;
- `context`, `conversion`, `promotions`, `analytics` and `partner-panel` emit explicit surface-focus intents rather than manipulating selectors/globals;
- `reputation` reuses the existing Assistant adapter and emits the result as tutorial-only evidence;
- missing business coordinates fail closed and never synthesize an approximate point;
- all M65 tutorial/live-runtime events are marked `excludeFromBusinessMetrics: true`.

The official V2 step union does not contain a `notifications` step. M65 therefore does not invent one merely to mirror a legacy branch that only highlighted another surface.

## Legacy globals deliberately not restored

The implementation does not introduce or depend on:

- `_assistantSendMessage`;
- `showAssistant`;
- `getActiveMapInstance`;
- selector-driven feature highlighting;
- global map mutation owned by Business;
- fabricated analytics or notification payloads.

This is an intentional architectural preservation of observable behavior, not a byte-for-byte restoration of the V1 monolith.

## Permanent Chromium evidence

The Business Live Runtime Browser Contract runs against the built workspace and proves:

- `arrival` emits place presentation, map presentation and map focus for the confirmed Business location;
- missing coordinates produce the fail-closed location message and no synthetic map presentation;
- `context` focuses Assistant semantically;
- `map` and `ecosystem` re-present the same resolved business through structured events;
- `conversion`, `promotions`, `analytics` and `partner-panel` emit the intended owner-facing focus requests;
- `reputation` calls the existing Assistant port with the business name and publishes the Assistant result;
- tutorial/live events remain excluded from production Business metrics;
- the built runtime source does not contain the legacy globals `_assistantSendMessage`, `showAssistant` or `getActiveMapInstance`.

The first PR-head run of this permanent contract completed successfully on `3a9be49e64e7713aae2f9bc83ca525a48d2c3358`.

## Regression evidence

On the same PR head:

- Quality Gate: PASS — formatting, architecture, Feature Registry, lint, typecheck, tests and build;
- Business Onboarding Browser Contract: PASS;
- Business Onboarding Route Browser Contract: PASS;
- Business Onboarding Profile Browser Contract: PASS;
- Business Onboarding Workspace Browser Contract: PASS;
- Business Onboarding Commercial Browser Contract: PASS after rerun of a timing-sensitive first attempt;
- Business Live Runtime Browser Contract: PASS.

The Commercial rerun passed without a code change, confirming that M65 did not alter the Business-to-Payments lifecycle.

## Migration impact

`Live Business runtime` moves from `PARTIAL` to `PASS` because every frozen Business-owned observable responsibility is now either:

1. implemented through an explicit V2 semantic event/port; or
2. delegated to the already equivalent owning feature instead of being duplicated in Business.

The Business migration matrix becomes:

- `PASS`: 19
- `PARTIAL`: 0
- `GAP`: 0
- `N/A`: 1
- total: 20

The sole `N/A` is the checkout client because payment execution belongs to `FEATURE-0009`.

With all 19 Business-owned contracts at PASS and executable browser/Quality evidence in place, `FEATURE-0005` may advance from `baseline-pending` to `equivalent`. This does not mark the feature `released`; deployment/rollout remains a separate lifecycle state.

## Required final gate

The documentation/registry reconciliation changes the PR head, so the official Quality Gate and all path-triggered Business browser contracts must pass again on the final helper-free SHA before merge.
