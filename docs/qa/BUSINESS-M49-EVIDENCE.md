# Business M49 — Core + Auth Consumer Evidence

## Scope

M49 creates the first Business-owned executable boundary after Auth M48. It deliberately keeps the Business domain framework-independent and consumes authorization from `@touristic/auth` instead of reimplementing session, roles or tenant policy.

## Base

- V2 base: `luizidebook/touristic-digital-platform@aefec2306fad4612e410e2d20f52c99b79ff9197`
- frozen V1 baseline: `luizidebook/morro-de-sao-paulo-digital@60746fd7fed97b805758b37adfdbe3bad2582bfe`

## Permanent implementation

M49 adds `@touristic/business` with:

- normalized immutable `BusinessProfile` / `BusinessPromotion` models;
- explicit `BusinessProfileRepository` port;
- read/write profile service scoped by normalized business ID;
- Auth-aware profile service that delegates tenant authorization to `authorizeBusinessAccess()`;
- viewer read-only enforcement inherited from Auth;
- admin tenant bypass inherited from Auth;
- fail-closed missing-session and cross-tenant decisions;
- input normalization that does not stringify arbitrary untrusted objects.

## Ownership rule

Business does **not** own or duplicate:

- credentials;
- session signing/verification;
- cookies;
- CSRF derivation/verification;
- same-origin enforcement;
- role vocabulary;
- tenant authorization policy.

Those remain owned by `FEATURE-0008` / `@touristic/auth` and its server/browser integration.

## Executable tests

The package tests cover:

- business-ID normalization;
- immutable profile defaults and bounded text normalization;
- repository read/write scoping;
- invalid tenant fail-closed behavior;
- authenticated owner read/write;
- missing-session denial;
- cross-tenant denial;
- viewer read-only behavior;
- admin tenant bypass.

## Migration matrix checkpoint

M49 records a conservative Business matrix of:

- `PASS`: 0;
- `PARTIAL`: 6;
- `GAP`: 13;
- `N/A`: 1.

Only three formerly missing Business-owned contracts advance to `PARTIAL`: domain/browser ownership now has a framework-independent core, profile behavior has explicit models/ports/services, and tenant authorization is consumed from Auth. Protected HTTP resources, dashboard/browser parity and onboarding remain unclosed.

## Non-goals

M49 does not claim Business dashboard or onboarding equivalence. It does not expose protected Business HTTP resources yet. M50 should bind this Business core to the Auth M48 HTTP boundary and prove real session/origin/CSRF/audit enforcement on Business-owned resources.

`FEATURE-0005` therefore remains `baseline-pending` after M49.

## Exit gate

M49 may merge only when the official Quality Gate and Auth Integration Contract are green on the final authored head, no temporary helper workflow remains, and the final diff contains only the Business package, lockfile importer and permanent evidence/matrix updates.
