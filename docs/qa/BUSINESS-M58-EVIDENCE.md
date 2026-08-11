# Business M58 — Tutorial Recommendation Sandbox Parity Evidence

## Scope

M58 closes the frozen V1 Business onboarding recommendation-sandbox gap without claiming production recommendation ownership. The implementation adds a Business-owned, tutorial-only candidate and deterministic scoring contract, then evaluates that candidate during the real `assistant-query` onboarding step.

## Frozen V1 source

Repository: `luizidebook/morro-de-sao-paulo-digital`

Frozen commit: `60746fd7fed97b805758b37adfdbe3bad2582bfe`

Primary evidence:

- `js/onboarding/runtime/business-recommendation-sandbox.js`
- `js/onboarding/business-onboarding.js`
- `js/onboarding/conversation/business-conversation-step-contracts.js`

The frozen V1 sandbox is not dead code: it is wired into Business onboarding and contributes a temporary Business candidate to the tutorial recommendation experience.

## M58 implementation

M58 introduces `packages/business/src/onboarding-recommendation.ts` as an isolated Business-owned subpath. The module builds an immutable tutorial candidate from onboarding context and preserves the frozen V1 additive scoring weights:

- category match: `+55`;
- specialty match: `+30`;
- exact/contained business-name match: `+100`;
- audience match: `+15`;
- final score capped at `100`;
- render threshold: `>= 50`.

The candidate carries only tutorial context required for the simulation: identity, category, specialty, objective, audience, CTA and normalized location metadata. It is explicitly marked `tutorial: true` and `excludeFromBusinessMetrics: true`.

## Runtime behavior

During the real `assistant-query` step, Business onboarding still delegates the tourist query to the shared Assistant adapter. M58 then evaluates the temporary tutorial candidate against the same query and persists both candidate and recommendation result only inside onboarding runtime context.

Every evaluation emits `businessTutorialRecommendationEvaluated`. A candidate that reaches the frozen threshold also emits a tutorial recommendation presentation plus `businessTutorialRecommendationRendered`.

The presentation is explicitly tutorial-only and excluded from Business metrics. M58 does not publish the candidate into a production Search catalog, recommendation index, analytics pipeline or commercial inventory.

## Additive scoring semantics

The M58 tests deliberately verify additive behavior rather than treating each weight as mutually exclusive.

For an `events` candidate whose specialty is `sunset`:

- `Quero uma festa hoje` scores `55` from category terms;
- `Quero ver Toca do Morcego` scores `100` from the business-name match;
- `procuro sunset` scores `85` because `sunset` matches both the events category vocabulary (`55`) and specialty (`30`);
- `para casais` scores `15` from audience only and therefore remains below the render threshold.

This preserves the observable V1 scoring contract rather than simplifying it into a new V2 ranking model.

## Ownership boundary

M58 is intentionally not a production recommendation engine.

Business owns the onboarding tutorial candidate and its frozen tutorial score. Production tourist discovery/recommendation ownership remains with the existing Search/Assistant architecture. M58 introduces no global recommendation registry, ranking service, credentials, network endpoint, persistence backend or analytics authority.

The module is exported as `@touristic/business/onboarding-recommendation` so browser consumers resolve it through the same explicit Business package boundary used by other onboarding contracts.

## Browser/module parity

Adding the new package subpath exposed an important browser-boundary requirement: deterministic import maps used by the onboarding surface and the frozen M57 route contract must explicitly map every Business onboarding subpath imported by `business-onboarding-runtime.js`.

M58 therefore permanently adds `@touristic/business/onboarding-recommendation` to:

- the real `apps/morro-digital-platform/public/business-onboarding.html` import map;
- the permanent `Business Onboarding Route Browser Contract` import map.

This is not test-only infrastructure. It is required for the real browser module graph. The final M58 head proves that both the main Business onboarding browser flow and the M57 verified-route browser flow continue to load and execute successfully in Chromium.

## Executable evidence

`onboarding-recommendation.test.ts` proves:

- immutable tutorial-only candidate construction;
- frozen V1 additive weights;
- score cap behavior through the name match;
- combined category + specialty scoring;
- below-threshold audience-only behavior;
- render threshold `>= 50`;
- explicit tutorial metric exclusion.

The permanent Business browser contracts prove the new module participates in a valid built browser graph:

- `Business Onboarding Browser Contract`: PASS on the final candidate head;
- `Business Onboarding Route Browser Contract`: PASS after adding the new subpath to the frozen M57 import map;
- `Business Onboarding Adapter Browser Contract`: PASS;
- `Business Dashboard Browser Contract`: PASS;
- `Business Auth Integration Contract`: PASS.

Because the real onboarding HTML import map changed, `Navigation Accessibility Baseline` was also required and passed, including forced-colors and 200% text checks.

## Quality Gate

On final candidate head `1f7befe527313b8b563f83e9c4969393b57d1ffa`, the official Quality Gate passed:

- install with frozen lockfile;
- formatting;
- architecture boundaries;
- Feature Registry validation;
- lint;
- typecheck;
- tests;
- build.

The same head also passed the Business Auth, Dashboard, Onboarding Adapter, Onboarding Browser, Onboarding Route and Navigation Accessibility workflows.

## Security and resilience

M58 adds no credential, cookie, CSRF, role, tenant authorization or network trust boundary. Candidate text is normalized/sanitized before use, tutorial location metadata is bounded to normalized values, and all recommendation outputs are explicitly excluded from real Business metrics.

The implementation remains deterministic and fail-contained: if the tutorial query does not reach the frozen threshold, no recommendation presentation is rendered.

## Migration decision

M58 is sufficient to promote `Recommendation sandbox` from `GAP` to `PASS`.

`Live Business runtime` remains `PARTIAL`: M58 closes one real observable runtime contract but does not claim profile sandbox/workspace, partner workspace, analytics breadth or commercial conversion parity.

`Profile sandbox/runtime` remains a separate gap and is the strongest next Business-owned runtime candidate because the frozen V1 profile sandbox is called by `business-live-runtime.js` and participates in the onboarding profile/promotions path.

## Non-goals

M58 does not replace the production Search or Assistant recommendation architecture, implement profile sandbox/workspace behavior, invent analytics endpoints, absorb Payments/checkout, implement commercial conversion, or publish tutorial candidates into production data.
