# Auth M47 — Domain Core Evidence

> Superseded branch note: this branch was created from the M46 base and its M47 implementation has since been integrated into `main` together with later Auth/Business milestones. This branch must not be merged again.

## Scope

M47 establishes the first executable `FEATURE-0008` boundary as a framework-independent package. It intentionally excludes HTTP, cookies, login endpoints, password storage, CSRF transport and Business UI.

## Base

- V2 base: `luizidebook/touristic-digital-platform@773ca56ff12aae358faa275b704d46d6247a1cfc`
- frozen V1 baseline: `luizidebook/morro-de-sao-paulo-digital@60746fd7fed97b805758b37adfdbe3bad2582bfe`
- migration baseline: `docs/migration/AUTH-MIGRATION-MATRIX.md`

## Executable core

`@touristic/auth` now owns:

- the V1 role vocabulary `owner | manager | viewer | admin`;
- normalization of email and business IDs;
- immutable, bounded session identity projection;
- immutable, normalized and deduplicated business scopes;
- expiry evaluation;
- viewer read-only policy;
- admin business-scope bypass for syntactically valid IDs;
- fail-closed business authorization decisions for missing session, expired session, invalid tenant ID, tenant mismatch and read-only mutation denial.

The core never receives credentials, cookie material, signing secrets or password hashes.

## Regression coverage

The package tests cover:

- exact role vocabulary;
- malformed email rejection;
- V1-compatible business ID grammar;
- business-scope normalization and deduplication;
- immutable session normalization;
- required business scope for non-admin identities;
- invalid session windows;
- exclusive expiry boundary;
- viewer-only read restriction;
- admin scope bypass;
- authentication-before-tenant evaluation;
- expiry-before-tenant evaluation;
- invalid tenant versus tenant mismatch;
- scoped reads and non-viewer mutations;
- viewer read versus mutation denial.

## Matrix effect

M47 changes the Auth matrix from `0 PASS / 0 PARTIAL / 20 GAP` to:

- `PASS`: 4
- `PARTIAL`: 2
- `GAP`: 14
- `N/A`: 0

PASS contracts are role model, viewer read-only policy, business/tenant scopes and tenant authorization. Signed-session payload semantics and expiry are PARTIAL because signing, revocation and transport are not yet implemented.

`FEATURE-0008` remains `baseline-pending`.

## Security boundary

M47 is deliberately incapable of authenticating a browser by itself. Future adapters must preserve the V1 security properties without moving security-sensitive state into this package or into browser code:

- HttpOnly session transport;
- Secure production cookies;
- signed session verification and bounded expiry;
- revocation/logout;
- same-origin and CSRF protection;
- password verification and rate limiting server-side;
- structured denial audit events without secrets.

## Final validation checkpoint

The final authored head must validate the package, matrix and this evidence together. No helper workflow is part of the intended PR diff.

## Exit gate

M47 may close only when the final authored head passes installation, formatting, architecture, Feature Registry, lint, typecheck, tests and build, and the PR contains no temporary workflow helper.
