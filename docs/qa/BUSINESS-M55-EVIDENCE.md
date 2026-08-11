# Business M55 — Onboarding Browser Lifecycle Evidence

## Scope

M55 ports the observable Business onboarding host/tutorial lifecycle after M53 established the workflow/session core and M54 bound Search, geospatial and Assistant adapters.

## Frozen V1 source

- repository: `luizidebook/morro-de-sao-paulo-digital`
- commit: `60746fd7fed97b805758b37adfdbe3bad2582bfe`
- primary host sources:
  - `js/onboarding/business-onboarding.js`
  - `js/onboarding/conversation/business-conversation-host.js`

The frozen V1 proves these lifecycle contracts:

- an active host is mounted once and exposes a current step/context;
- ACTIVE/PAUSED tutorial state may resume when still valid;
- render emits the current tutorial step before step-specific work executes;
- forward/back transitions are host-controlled;
- transitions may be blocked by step guards;
- complete and skip/close finalize lifecycle explicitly;
- restart returns to the welcome step;
- tutorial activity is observable through a body state and `businessTutorialActivityChanged`;
- busy/error presentation belongs to the browser host, not the Auth session.

## M55 implementation

M55 keeps the M54 runtime-isolation rule intact: onboarding is not re-exported from the main `@touristic/business` entrypoint.

New dedicated boundary:

- `@touristic/business/onboarding-host`

The host controller provides:

- the frozen 28-step ordering derived from the 5 M53 chapters;
- chapter/step progress metadata;
- next/back navigation;
- resume of non-expired ACTIVE/PAUSED workflow sessions;
- restart, pause/skip and complete lifecycle;
- optional transition guards;
- bounded fail-closed async guard timeout (`8000 ms` default).

The browser surface is mounted through the dedicated `business-onboarding.html` entrypoint and exposes:

- accessible dialog semantics;
- visible chapter/step progress;
- back, continue/conclude and pause/skip controls;
- busy/status state;
- `md-business-tutorial-active` body state;
- `businessTutorialActivityChanged` lifecycle events;
- completion/abandon events without becoming an authentication authority.

## Adapter ownership

M55 does not duplicate M54 discovery, location or Assistant implementations. Those remain in the existing Business onboarding adapter boundary and continue to be covered by the permanent `Business Onboarding Adapter Browser Contract`.

The onboarding workflow session remains product state only. It contains no credential, signed session token, cookie secret, CSRF secret, role authority or tenant authorization authority.

## Permanent browser evidence

`Business Onboarding Browser Contract` loads the built dedicated onboarding page in deterministic Chromium and validates:

1. host/surface mount;
2. accessible modal semantics;
3. active tutorial body/event state;
4. chapter 1 / step 1 presentation;
5. forward transition `welcome → category`;
6. back transition `category → welcome`;
7. skip/abandon teardown and inactive lifecycle event;
8. absence of browser runtime errors.

Unit tests additionally cover resume/expiry, immutable transitions, guard denial, bounded guard timeout, restart, pause and completion.

## Non-goals

M55 does not implement Payments/commercial conversion, analytics endpoints, recommendation sandbox ownership, partner workspace, or unrelated Business profile persistence breadth.

## Exit gate

M55 may close only when the final authored head passes:

- official Quality Gate;
- Business Onboarding Browser Contract;
- existing Business Onboarding Adapter Browser Contract;
- Business Auth Integration Contract;
- Business Dashboard Browser Contract;
- any automatically triggered accessibility/regression checks;
- final diff/review audit with no temporary helper workflow.
