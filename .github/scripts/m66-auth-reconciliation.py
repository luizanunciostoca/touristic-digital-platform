from pathlib import Path
import json

matrix_path = Path('docs/migration/AUTH-MIGRATION-MATRIX.md')
matrix = matrix_path.read_text()
matrix = matrix.replace('# Auth & Session — Migration Matrix (M48 integration)', '# Auth & Session — Migration Matrix (M66 reconciliation)', 1)
matrix = matrix.replace('`FEATURE-0008` remains `baseline-pending` after M48. The server/browser security boundary is executable, but final login-surface parity and enforcement/audit on Business-owned protected resources still require the Business consumer milestones.', '`FEATURE-0008` is `equivalent` after M66. The Auth server/browser boundary, canonical login surface and Business-owned protected-resource enforcement are all covered by permanent executable evidence.', 1)
replacements = {
'| Login with email/password                 | `dashboard/login.html`; `/api/dashboard/auth/login`                     | real same-origin login API + credential verification; Business login UI not ported | PARTIAL | Keep Auth API stable; close visual/login-surface parity with Business dashboard consumer.         |': '| Login with email/password                 | `dashboard/login.html`; `/api/dashboard/auth/login`                     | canonical `/dashboard/login.html` + `DashboardAuthClient.login()` + real Chromium login lifecycle | PASS | V1 login behavior is preserved on the Auth-owned browser/server boundary. |',
'| CSRF on unsafe methods                    | `X-CSRF-Token`; `INVALID_CSRF`                                          | logout mutation enforces CSRF; browser client injects header for protected methods | PARTIAL | Apply the same Auth enforcement boundary to future Business-owned protected mutation routes.      |': '| CSRF on unsafe methods                    | `X-CSRF-Token`; `INVALID_CSRF`                                          | Auth logout and real Business protected mutations enforce CSRF through `authorizeBusinessRequest()` | PASS | Unsafe Business mutations reuse the Auth-owned CSRF boundary. |',
'| Same-origin enforcement                   | Origin/Referer verification server-side                                 | reusable `isSameOriginAllowed()` + login/logout enforcement                        | PARTIAL | Reuse the same server decision for future Business-owned protected mutation routes.               |': '| Same-origin enforcement                   | Origin/Referer verification server-side                                 | login/logout plus real Business mutations delegate to `isSameOriginAllowed()` through Auth | PASS | Same-origin policy is enforced on Auth and Business mutation boundaries. |',
'| Security audit denials                    | V1 `audit(...)` calls on auth/origin/mutation/tenant denial             | Auth API emits structured login/session/origin/mutation denials                    | PARTIAL | Add Business tenant/resource-denial audit calls when protected Business APIs become executable.   |': '| Security audit denials                    | V1 `audit(...)` calls on auth/origin/mutation/tenant denial             | Auth emits structured denials for session, origin, CSRF, role, invalid business ID and tenant access | PASS | Business resource denials are audited by the shared Auth authorization boundary. |',
}
for old, new in replacements.items():
    if old not in matrix:
        raise SystemExit(f'matrix row anchor missing: {old[:60]}')
    matrix = matrix.replace(old, new, 1)
score_start = matrix.index('## M48 score')
exec_start = matrix.index('## Executable evidence')
new_score = '''## M66 score\n\n- `PASS`: 20\n- `PARTIAL`: 0\n- `GAP`: 0\n- `N/A`: 0\n- total: 20\n\nM66 closes the four consumer-dependent rows left intentionally partial by M48. The canonical login surface is now executable, and M50/M51 plus the current Auth runtime prove CSRF, same-origin and structured security-audit enforcement on real Business resources.\n\n'''
matrix = matrix[:score_start] + new_score + matrix[exec_start:]
next_start = matrix.index('## Next milestone')
matrix = matrix[:next_start] + '''## Promotion decision\n\n`FEATURE-0008` is promoted to `equivalent`, not `released`. Deployment identity-store hardening or distributed rate limiting may evolve operationally without reopening V1 parity unless they change the observable Auth contract.\n\n'''
matrix_path.write_text(matrix)

registry_path = Path('docs/features/registry.json')
registry = json.loads(registry_path.read_text())
feature = next((item for item in registry['features'] if item['id'] == 'FEATURE-0008'), None)
if not feature or feature.get('status') != 'baseline-pending':
    raise SystemExit('FEATURE-0008 expected baseline-pending')
feature['status'] = 'equivalent'
feature['equivalence'] = {'behavior': True, 'visual': True, 'api': True}
registry_path.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + '\n')

tracker_path = Path('docs/migration/MASTER-MIGRATION-TRACKER.md')
tracker = tracker_path.read_text()
old_row = '| MIG-0009 | autenticação e sessão | Auth | FEATURE-0008 | `packages/auth` | 6 | discovered | n/a | pendente | pendente | crítico |'
new_row = '| MIG-0009 | autenticação e sessão | Auth | FEATURE-0008 | `packages/auth` + `packages/auth-browser` + Auth surfaces in `dashboard/` | 6 | equivalent | login V1-equivalent and canonical dashboard return proven in Chromium | 20/20 Auth contracts PASS: login/session/cookie/CSRF/origin/roles/tenant/audit/revocation | `AUTH-MIGRATION-MATRIX.md`; M47–M48 + M50–M52 + M66 evidence; PR #129 Quality + Auth/Business browser contracts | crítico |'
if old_row not in tracker:
    raise SystemExit('MIG-0009 tracker row anchor missing')
tracker = tracker.replace(old_row, new_row, 1)
anchor = '## Evidência consolidada — checkpoint Home + Runtime + Geospatial'
if anchor not in tracker:
    raise SystemExit('tracker section anchor missing')
auth_section = '''## Auth equivalente — MIG-0009\n\nM66 closes the four consumer-dependent Auth parity rows intentionally left partial in M48. The canonical matrix is `20 PASS / 0 PARTIAL / 0 GAP / 0 N/A`. The feature is `equivalent`, not `released`. Permanent evidence includes the Auth Integration Contract, Auth Login Browser Contract and Business dashboard/security regressions on PR #129.\n\n'''
tracker = tracker.replace(anchor, auth_section + anchor, 1)
tracker_path.write_text(tracker)

evidence_path = Path('docs/qa/AUTH-M66-EVIDENCE.md')
evidence_path.write_text('''# Auth M66 — Login Surface + Final Reconciliation Evidence\n\n## Scope\n\nM66 closes the final consumer-dependent Auth parity gap left by M48 without moving authentication authority into Business UI code.\n\n## Permanent implementation\n\n- canonical `/dashboard/login.html` with the frozen V1 email/password, loading and alert contract;\n- `DashboardAuthClient.login()` using same-origin credentials and retaining only the browser-safe CSRF projection;\n- safe dashboard-scoped return handling;\n- `/dashboard/index-v3-improved.html` compatibility entry forwarding to the mounted V2 Business dashboard;\n- permanent `Auth Login Browser Contract` in deterministic Chromium.\n\n## Reconciled M48 partials\n\n1. Login with email/password — closed by the canonical login UI and browser lifecycle.\n2. CSRF on unsafe methods — closed by M50/M51 real Business mutations through `authorizeBusinessRequest()`.\n3. Same-origin enforcement — closed by the same real Business mutation boundary.\n4. Security audit denials — closed by structured Auth audit events for missing/invalid session, cross-origin, invalid CSRF, read-only role, invalid business ID and tenant denial.\n\n## Executable evidence\n\nOn PR #129 head `da3fed658d165745f2e4085e2746a3e35251ea5f`, before canonical-document promotion:\n\n- Quality Gate — success;\n- Auth Integration Contract — success;\n- Auth Login Browser Contract — success;\n- Business Dashboard Client Contract — success;\n- Business Dashboard Browser Contract — success.\n\nThe Auth Login Browser Contract proves invalid credentials, valid UI login, CSRF projection, canonical dashboard return, logout/revocation and rejection of unsafe external return targets.\n\n## Promotion decision\n\nThe Auth matrix is promoted to `20 PASS / 0 PARTIAL / 0 GAP / 0 N/A`. `FEATURE-0008` and `MIG-0009` are `equivalent`, not `released`.\n\n## Final-head discipline\n\nAfter this documentation/registry promotion, the final helper-free head must repeat Quality Gate and all triggered Auth/Business browser regressions before merge.\n''')
