# Business M50 — Protected HTTP Evidence

## Scope

M50 binds the Business profile service introduced in M49 to a real Business-owned HTTP resource while reusing the Auth security boundary delivered by M48.

The milestone deliberately does not create a dashboard UI, onboarding flow, payment code or Business-owned session/CSRF implementation.

## Runtime boundary

The Morro runtime now exposes:

- `GET /api/business/:businessId/profile`;
- `PUT /api/business/:businessId/profile`.

`business-api.mjs` owns Business routing and profile serialization. It delegates authentication, same-origin mutation protection, CSRF validation, role policy and tenant authorization to `authApi.authorizeBusinessRequest()`.

The Auth adapter delegates the actual tenant/read-only decision to `authorizeBusinessAccess()` from `@touristic/auth` rather than duplicating authorization logic inside Business.

## Security contract

The permanent `Business Auth Integration Contract` validates the following against the real dev-server boundary:

- an authenticated owner can mutate and read its own Business profile;
- cross-tenant reads are rejected;
- invalid CSRF is rejected for mutations;
- a `viewer` session is read-only and cannot mutate a profile;
- all authentication/session material remains owned by Auth;
- the Business package and workspace continue to lint, typecheck, test and build.

The route returns `Cache-Control: no-store`; authenticated profile responses also vary on `Cookie`.

## Persistence status

The M50 runtime repository is intentionally in-memory. This is sufficient to prove the protected HTTP boundary and authorization contract but is not production persistence evidence. Business profile behavior therefore remains `PARTIAL` until the intended persistence/API contract is frozen and implemented.

## Matrix decision

After M50:

- Business tenant selection/authorization: `PASS` for the real protected Business HTTP boundary;
- Protected dashboard API consumption: `PARTIAL` because an authenticated Business HTTP resource now exists, but the dashboard browser consumer is still absent;
- Business profile behavior remains `PARTIAL` because persistence/browser behavior is incomplete;
- Dashboard UI and onboarding remain `GAP`.

`FEATURE-0005` remains `baseline-pending`.

## Final validation checkpoint

The first executable Business/Auth run completed successfully before the documentation-only formatting correction. The final authored head must repeat both the Quality Gate and the permanent Business/Auth integration contract so the merge evidence is tied to one clean commit with no one-shot helpers.

## Exit gate

M50 may merge only when the final authored head passes:

1. Quality Gate;
2. Business Auth Integration Contract;
3. diff audit with no one-shot helper workflows;
4. no unresolved review thread.
