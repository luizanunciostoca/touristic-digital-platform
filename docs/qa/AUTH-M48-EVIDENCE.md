# Auth M48 — Server / Browser Integration Evidence

## Scope

M48 integrates the domain-neutral Auth core from M47 with executable server and browser boundaries while preserving Auth ownership of credentials, session transport, CSRF, revocation and authorization primitives.

## Base

- V2 base: `luizidebook/touristic-digital-platform@f90e7b831f4867f65bc7f7f886b4529dd555d2c2`
- Frozen V1 security baseline: `luizidebook/morro-de-sao-paulo-digital@60746fd7fed97b805758b37adfdbe3bad2582bfe`

## Permanent implementation

M48 adds:

- `services/auth` as the server-owned Auth/security implementation;
- `@touristic/auth-browser` as the browser-safe session/protected-fetch client;
- same-origin `/api/dashboard/auth/login`, `/session` and `/logout` integration in the Morro runtime;
- `Auth Integration Contract` as permanent executable evidence.

The server boundary owns:

- scrypt password hashing/verification;
- configured identity parsing and normalization;
- signed bounded sessions with `iat`, `exp` and `jti`;
- HttpOnly / SameSite=Strict cookie serialization and Secure cookies in production;
- session verification and expiry;
- revocation;
- CSRF derivation and timing-safe validation;
- Origin/Referer same-origin decisions;
- safe dashboard return paths;
- login rate limiting;
- fail-closed unavailable-auth behavior;
- structured Auth audit callbacks.

The browser boundary owns only browser-safe consumption:

- `credentials: "same-origin"` for session/protected resources;
- safe session projection loading;
- CSRF token storage separate from the HttpOnly session;
- `X-CSRF-Token` injection on unsafe protected requests;
- redirect on `401`;
- exactly one session refresh/retry after `INVALID_CSRF`;
- logout through the authenticated server boundary.

## Validation on implementation head

Implementation head before documentation update:

`e495634b23c56134cbe97da0bf705e177367e48c`

The following workflows completed successfully on that same head:

- Quality Gate;
- Auth Integration Contract;
- Assistant Photo Browser Contract;
- Navigation Visual Baseline;
- Map Provider Regression;
- Mapbox Visual Contract Regression.

The Quality Gate passed installation, formatting, architecture boundaries, Feature Registry validation, lint, typecheck, tests and build.

The Auth Integration Contract passed Auth package validation, workspace build and the real login/session/logout HTTP contract.

## Matrix decision

After M48:

- PASS: 16
- PARTIAL: 4
- GAP: 0
- N/A: 0

The remaining partial contracts are intentionally consumer-facing seams: login/dashboard visual surface plus enforcement/audit on future Business-owned protected resources. They do not justify duplicating security logic in Business.

`FEATURE-0008` therefore remains `baseline-pending` at M48. Its Auth primitives are executable, but final equivalence must be proven through the protected Business consumer and browser surface.

The formatting-only M48 helper was removed from the branch before final validation; it is not part of the permanent milestone diff.

## Exit gate

M48 may merge only after the documentation head repeats the official Quality Gate and Auth Integration Contract, the final diff contains no temporary helper workflow, and the PR has no unresolved review thread.
