# Business M51 — Authenticated Dashboard Consumer Evidence

## Scope

M51 introduces the browser-facing Business dashboard consumer that sits between the authenticated session boundary from M48 and the protected Business profile HTTP resource from M50.

It does not port the full V1 dashboard visual surface, analytics endpoints, onboarding or payment behavior.

## Browser security boundary

`@touristic/auth-browser` now treats `/api/business` as a protected same-origin prefix in addition to the existing dashboard/offers prefixes.

That means Business mutations made through `DashboardAuthClient.secureFetch()` receive the same M48 behavior:

- `credentials: "same-origin"`;
- browser-safe CSRF projection on unsafe methods;
- one bounded CSRF refresh/retry after `INVALID_CSRF`;
- `401` redirect through the dashboard-safe login return path;
- no browser access to session cookie/signing material.

Dedicated tests prove GET and PUT Business requests traverse this boundary correctly.

## Dashboard consumer

`business-dashboard-client.ts` owns no authentication mechanism. It receives a `DashboardAuthClient` port and provides:

- authenticated bootstrap;
- Business scope selection from the session projection;
- protected profile load;
- protected profile save.

For non-admin users an out-of-scope requested Business ID is not trusted by the client; it falls back to an authenticated allowed scope. The server remains the authorization authority. Admin sessions may select an explicit normalized Business ID and are still authorized server-side on the real resource.

If no authenticated Business scope can be selected, bootstrap fails closed with `BUSINESS_SCOPE_REQUIRED` before any Business resource is requested.

## Frozen visual baseline

`docs/migration/BUSINESS-DASHBOARD-V1-BASELINE.md` freezes the observable V1 dashboard surface from `dashboard/index-v3-improved.html`, `dashboard-v2.css`, `dashboard-v2.js` and `auth-client.js` at the canonical V1 commit.

M51 intentionally does not claim visual parity. The sidebar, responsive shell, views, charts, metric cards, theme behavior and other presentation contracts remain a later browser/visual milestone.

## Matrix decision

After M51:

- Protected dashboard API consumption: `PASS` for the Business profile consumer because the app client uses the real Auth browser port and the M50 protected resource;
- Authenticated dashboard consumer: `PARTIAL` because an executable consumer exists but the complete dashboard browser surface is not yet mounted;
- Dashboard visual surface remains `GAP`;
- Business profile remains `PARTIAL` because production persistence and full browser editing parity are not yet complete.

`FEATURE-0005` remains `baseline-pending`.

## Permanent regression

`Business Dashboard Client Contract` permanently validates:

- Auth browser lint/typecheck/tests including `/api/business` protection;
- Morro app lint/typecheck/tests including dashboard bootstrap/load/save behavior;
- full workspace build.

## Exit gate

M51 may merge only after the final authored head passes:

1. Quality Gate;
2. Business Dashboard Client Contract;
3. existing Auth/Business regressions triggered by the changed paths;
4. diff audit with no one-shot workflows;
5. no unresolved review threads.
