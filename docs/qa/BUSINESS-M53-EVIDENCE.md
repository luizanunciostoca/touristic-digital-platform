# Business M53 — Onboarding Core Evidence

## Scope

M53 ports the Business-owned onboarding core from the frozen V1 baseline into `@touristic/business` without coupling onboarding workflow state to Auth session state, browser storage, DOM globals, or Payments.

## Frozen V1 evidence

- repository: `luizidebook/morro-de-sao-paulo-digital`
- commit: `60746fd7fed97b805758b37adfdbe3bad2582bfe`
- primary sources:
  - `js/onboarding/business-onboarding.js`
  - `js/onboarding/conversation/business-conversation-flow.js`
  - `js/onboarding/session/business-tutorial-session.js`
  - `js/onboarding/conversation/*`
  - `js/onboarding/engine/*`
  - `js/onboarding/runtime/*`
  - `js/onboarding/tours/*`

## Frozen conversation contract

The M53 core preserves the V1 conversation topology:

- 5 chapters;
- 28 ordered steps;
- the V1 step-to-state mapping;
- immutable chapter metadata;
- onboarding state transitions independent from authenticated dashboard session state.

The five chapters remain:

1. `business-foundation`;
2. `tourist-discovery`;
3. `intelligent-recommendation`;
4. `tourist-experience`;
5. `business-growth`.

## Onboarding session contract

M53 preserves the observable V1 workflow/session invariants:

- session version `2`;
- seven-day onboarding TTL;
- statuses `ACTIVE`, `PAUSED`, `COMPLETED`, `EXPIRED`, `CONVERTED`, `DISCARDED`;
- only active or paused, unexpired sessions are resumable;
- pause/resume/complete lifecycle;
- current and previous onboarding state;
- conversation draft state;
- Business sandbox draft with `publishable: false`;
- completed/skipped capability sets with deterministic deduplication.

The onboarding session is intentionally **not** an Auth session. It contains no credentials, signed cookie, CSRF material, session secret, role authorization token, or tenant authorization authority.

## Ownership boundary

`@touristic/business` now exposes explicit onboarding ports for:

- Business discovery;
- Business location resolution/device location;
- Assistant conversation/recommendation consumption.

Concrete Search, geospatial and Assistant adapters remain outside this milestone. The core therefore stays framework-independent and does not import browser DOM/localStorage APIs.

Payments/checkout are not Business-owned in M53. Commercial conversion and payment execution remain owned by `FEATURE-0009` and must only be consumed through a future Payments boundary.

## Executable evidence

`packages/business/src/onboarding.test.ts` covers:

- exact five-chapter / 28-step inventory;
- chapter metadata lookup;
- immutable initial onboarding session;
- seven-day TTL;
- V1 step-state transitions;
- pause → resume semantics;
- resumability and expiry boundaries;
- completion state;
- completed/skipped capability deduplication.

Existing Business/Auth regressions are required to remain green to prove the onboarding core does not regress the protected Business resource or mounted dashboard surface.

## Promotion decision

M53 does not promote `FEATURE-0005` to `equivalent`.

The onboarding core is executable, but concrete discovery/location/Assistant adapters, browser tutorial surface, tours, and broader live runtime behavior remain incomplete.

## Exit gate

M53 may close only when the same final authored head passes:

1. Quality Gate;
2. Business Auth Integration Contract;
3. Business Dashboard Browser Contract;
4. final diff audit with no temporary helper workflow;
5. no unresolved review thread.
