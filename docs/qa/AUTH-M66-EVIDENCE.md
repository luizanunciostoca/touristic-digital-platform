# Auth M66 — Login Surface + Final Reconciliation Evidence

## Scope

M66 closes the final consumer-dependent Auth parity gap left by M48 without moving authentication authority into Business UI code.

## Permanent implementation

- canonical `/dashboard/login.html` with the frozen V1 email/password, loading and alert contract;
- `DashboardAuthClient.login()` using same-origin credentials and retaining only the browser-safe CSRF projection;
- safe dashboard-scoped return handling;
- `/dashboard/index-v3-improved.html` compatibility entry forwarding to the mounted V2 Business dashboard;
- permanent `Auth Login Browser Contract` in deterministic Chromium.

## Reconciled M48 partials

1. Login with email/password — closed by the canonical login UI and browser lifecycle.
2. CSRF on unsafe methods — closed by M50/M51 real Business mutations through `authorizeBusinessRequest()`.
3. Same-origin enforcement — closed by the same real Business mutation boundary.
4. Security audit denials — closed by structured Auth audit events for missing/invalid session, cross-origin, invalid CSRF, read-only role, invalid business ID and tenant denial.

## Executable evidence

On PR #129 head `da3fed658d165745f2e4085e2746a3e35251ea5f`, before canonical-document promotion:

- Quality Gate — success;
- Auth Integration Contract — success;
- Auth Login Browser Contract — success;
- Business Dashboard Client Contract — success;
- Business Dashboard Browser Contract — success.

The Auth Login Browser Contract proves invalid credentials, valid UI login, CSRF projection, canonical dashboard return, logout/revocation and rejection of unsafe external return targets.

## Promotion decision

The Auth matrix is promoted to `20 PASS / 0 PARTIAL / 0 GAP / 0 N/A`. `FEATURE-0008` and `MIG-0009` are `equivalent`, not `released`.

## Final-head discipline

After this documentation/registry promotion, the final helper-free head must repeat Quality Gate and all triggered Auth/Business browser regressions before merge.
