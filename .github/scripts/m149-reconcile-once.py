from collections import Counter
from pathlib import Path

workflow_path = Path(".github/workflows/payments-browser-checkout-contract.yml")
matrix_path = Path("docs/migration/PAYMENTS-MIGRATION-MATRIX.md")
tracker_path = Path("docs/migration/MASTER-MIGRATION-TRACKER.md")
evidence_path = Path("docs/qa/PAYMENTS-M149-EVIDENCE.md")

workflow = workflow_path.read_text()
workflow = workflow.replace(
    "name: Payments Browser Checkout Contract",
    "name: Payments M149 Browser Checkout Contract",
    1,
)
workflow = workflow.replace("m148", "m149").replace("M148", "M149")
trigger_anchor = '      - "apps/morro-digital-platform/tooling/dev-server.mjs"\n'
doc_paths = (
    '      - "docs/qa/PAYMENTS-M149-EVIDENCE.md"\n'
    '      - "docs/migration/PAYMENTS-MIGRATION-MATRIX.md"\n'
    '      - "docs/migration/MASTER-MIGRATION-TRACKER.md"\n'
)
assert workflow.count(trigger_anchor) == 2, "expected pull/push trigger anchors"
workflow = workflow.replace(trigger_anchor, trigger_anchor + doc_paths)
workflow_path.write_text(workflow)

matrix = matrix_path.read_text()
first_line, rest = matrix.split("\n", 1)
assert first_line.startswith("# Payments / Ordering / Financial — Migration Matrix")
matrix = (
    "# Payments / Ordering / Financial — Migration Matrix "
    "(M149 browser launch/confirmation adapter)\n" + rest
)

boundary = """## M149 implementation boundary

M149 adds the Payments-owned browser launch/confirmation adapter without weakening M139. The client accepts only an already-valid Business handoff plus exactly one audited create-authority model: authenticated CSRF + exact Business scope, or a server-issued checkout-handoff capability. Browser code never signs guest capabilities, never receives the HMAC secret and never fabricates CSRF or Business authority.

The adapter derives the exact `business:<sessionId>:<planId>` idempotency key, creates checkout with same-origin credentials, keeps the plaintext status capability private to the client closure, opens the provider URL with `noopener,noreferrer` plus blocked-popup location fallback, and preserves the frozen V1 polling budget of 2500 ms × 240 attempts. `CONFIRMED` alone is not success: only the authoritative persisted `verifiedPayment` projection can emit `businessPaymentVerified`; terminal/timeout paths emit bounded `businessPaymentVerificationFailed`.

The Business onboarding already produces `businessCheckoutRequested`, but no legitimate public browser authority-bootstrap exists. The guest HMAC issuer remains server-only and authenticated creation still requires a real platform session, CSRF and exact `X-Business-ID`. Therefore M149 intentionally does not auto-wire the Business request into Payments. That composition stays PARTIAL until a later milestone supplies one of the existing M139 authority models. Deployed third-party provider/browser E2E also remains PARTIAL, and subscription recurrence remains a GAP.

"""
marker = "## Matrix\n"
assert marker in matrix
if "## M149 implementation boundary" not in matrix:
    matrix = matrix.replace(marker, boundary + marker, 1)

lines = matrix.splitlines()
output: list[str] = []
inserted_authority = False
for line in lines:
    if line.startswith("| Browser checkout launch "):
        line = "| Browser checkout launch | popup `noopener,noreferrer`, location fallback | M149 Payments browser client creates through the protected M139 API, opens only the server-projected checkout URL and falls back to location only when popup creation is blocked; authority must be supplied by an audited external source | PASS | Keep launch Payments-owned; no browser-generated guest authority or Business-owned financial execution. |"
    elif line.startswith("| Browser confirmation wait "):
        line = "| Browser confirmation wait | poll every 2.5 s, max 240 attempts | M149 preserves 2500 ms × 240 attempts, reuses the private status capability exactly and fails closed on timeout, terminal state or identity substitution | PASS | Preserve the bounded V1 wait budget; provider/browser transport remains replaceable behind the client contract. |"
    elif line.startswith("| Browser verified-payment event "):
        line = "| Browser verified-payment event | `businessPaymentVerified` after server says `CONFIRMED` | M149 emits the existing Business-compatible success signal only from an identity-matched authoritative `verifiedPayment`; `CONFIRMED` without verified evidence keeps polling | PASS | Never synthesize Business conversion from return URL, popup state or provider command acceptance. |"
    elif line.startswith("| Browser failure event "):
        line = "| Browser failure event | `businessPaymentVerificationFailed` | M149 emits the existing bounded Business failure signal for authoritative terminal state, timeout or normalized client failure without leaking the private status capability | PASS | Failure signalling carries no authority to mutate Payment or Business state. |"
        output.append(line)
        output.append(
            "| Business → Payments authority composition | V1 onboarding invokes checkout directly | Business produces `businessCheckoutRequested` and M149 provides the Payments client, but public onboarding has no valid browser authority bootstrap; M139 guest signing remains server-only and authenticated creation still requires real session/CSRF/scope | PARTIAL | Add a dedicated authority-bootstrap/composition milestone; never expose HMAC signing material or fabricate browser authority. |"
        )
        inserted_authority = True
        continue
    output.append(line)
assert inserted_authority, "authority composition row was not inserted"
matrix = "\n".join(output) + "\n"

score_start = (
    matrix.index("## M146 score")
    if "## M146 score" in matrix
    else matrix.index("## M149 score")
)
promotion_start = matrix.index("## Promotion decision", score_start)
score_block = """## M149 score

- `PASS`: 27
- `PARTIAL`: 5
- `GAP`: 1
- `N/A`: 1
- total: 34

M149 closes the Payments-owned browser launch, bounded confirmation wait and Business-compatible result-signal contracts while preserving the audited M139 authority boundary. It does not make the public Business onboarding capable of creating a checkout by itself. The remaining GAP is subscription lifecycle; authority bootstrap/composition, financial observability, deployed provider/browser E2E, distributed rate limiting and release/rollback completion remain PARTIAL.

"""
matrix = matrix[:score_start] + score_block + matrix[promotion_start:]
matrix = matrix.replace(
    "After M146 and green Quality, Persistence, Sandbox Provider, Verified Webhook, Verified Outcome, Operational Ledger, Refund Command, Reconciliation, Settlement and Ticketing regression gates on the final head:",
    "After M149 and green Quality plus the permanent Payments M149 Browser Checkout Contract on the final head/merge ref:",
    1,
)
old_decisions = """- split/repasse/settlement is backend-only and cannot be activated from browser/provider response alone;
- provider transfer acceptance remains non-authoritative until verified read-back;
- historical ledger entries remain immutable and refund/reversal use compensating entries;
- no subscription lifecycle, browser checkout journey, distributed limiter or real-money production provider is enabled."""
new_decisions = """- browser launch/polling and Business-compatible verified/failure signals are executable but require a legitimate M139 create authority supplied outside the client;
- automatic public `businessCheckoutRequested` → Payments composition remains disabled;
- provider transfer acceptance remains non-authoritative until verified read-back and historical ledger entries remain immutable;
- no subscription lifecycle, distributed limiter, deployed third-party browser E2E or real-money production provider is enabled."""
assert old_decisions in matrix, "promotion decision anchor changed"
matrix = matrix.replace(old_decisions, new_decisions, 1)
remaining_start = matrix.index("## Remaining Payments work")
matrix = matrix[:remaining_start] + """## Remaining Payments work

The remaining Wave 8 GAP is subscription lifecycle. Partial contracts are the Business → Payments authority bootstrap/composition, financial observability, deployed provider/browser E2E, distributed rate limiting and rollback/release completion. The M149 client itself is intentionally not a credential issuer. Affiliates remains a separate domain and may consume Financial settlement primitives only after its own attribution, commission and authorization contracts are implemented.
"""

statuses: list[str] = []
for line in matrix.splitlines():
    if not line.startswith("| ") or line.startswith("| Contract") or line.startswith("| ---"):
        continue
    cells = [cell.strip() for cell in line.split("|")[1:-1]]
    if len(cells) >= 4 and cells[3] in {"PASS", "PARTIAL", "GAP", "N/A"}:
        statuses.append(cells[3])
counts = Counter(statuses)
expected = Counter({"PASS": 27, "PARTIAL": 5, "GAP": 1, "N/A": 1})
assert counts == expected and len(statuses) == 34, (counts, len(statuses))
matrix_path.write_text(matrix)

tracker = tracker_path.read_text()
tracker_lines = tracker.splitlines()
replacement_row = "| MIG-0010 | pagamentos/assinaturas | Ordering / Financial | FEATURE-0009 | `@touristic/ordering` + `@touristic/ordering-server` + `@touristic/financial` + `@touristic/financial-server` + runtime HTTP/browser no Morro Digital | 8 | migrating | M149 adiciona browser launch/polling executável sem fabricar autoridade; composição pública Business → Payments continua bloqueada | 34 contratos: 27 PASS / 5 PARTIAL / 1 GAP / 1 N/A; checkout browser exige autoridade M139 legítima e só `verifiedPayment` autoritativo produz sucesso | `PAYMENTS-V1-BASELINE.md`; `PAYMENTS-MIGRATION-MATRIX.md`; evidências M135–M149 | crítico |"
for index, line in enumerate(tracker_lines):
    if line.startswith("| MIG-0010 |"):
        tracker_lines[index] = replacement_row
        break
else:
    raise AssertionError("MIG-0010 row not found")
tracker = "\n".join(tracker_lines) + "\n"

section_start = tracker.index("## Payments em migração — MIG-0010")
section_end = tracker.index(
    "## Evidência consolidada — checkpoint Home + Runtime + Geospatial",
    section_start,
)
payments_section = """## Payments em migração — MIG-0010

M135 congelou a Wave 8 a partir da V1 `luizidebook/morro-de-sao-paulo-digital@60746fd7fed97b805758b37adfdbe3bad2582bfe` e separou Business, Ordering e Financial sem habilitar money movement. M136–M146 materializaram domínio, persistência, checkout server-authoritative, HTTP/Auth, sandbox provider, webhook verificado, resultado persistido, ledger double-entry, refund, reconciliation e split/repasse/settlement com read-back autoritativo.

M149 fecha o adapter Payments-owned de browser launch/confirmation sem quebrar M139:

- aceita somente o handoff Business normalizado e exatamente um modelo de autoridade já auditado;
- deriva `business:<sessionId>:<planId>` e nunca aceita preço/valor financeiro do browser como autoridade;
- mantém o `cst_v1_*` somente no closure do cliente, sem local/session storage;
- abre checkout com `noopener,noreferrer` e fallback de navegação apenas quando o popup é bloqueado;
- preserva polling V1 de 2500 ms × 240 tentativas;
- `CONFIRMED` sem `verifiedPayment` não converte nem encerra como sucesso;
- emite `businessPaymentVerified` somente do resultado Financial autoritativo e usa `businessPaymentVerificationFailed` para falha/timeout terminal;
- não assina capability guest no browser e não expõe o segredo HMAC server-only;
- não auto-compõe `businessCheckoutRequested`, porque a superfície pública atual não possui uma fonte legítima de sessão+CSRF+Business scope nem endpoint server-side de bootstrap da capability guest.

A matriz canônica M149 passa a:

```text
PASS     27
PARTIAL   5
GAP       1
N/A       1
TOTAL    34
```

`MIG-0010` e `FEATURE-0009` permanecem `migrating`; equivalence behavior/visual/API continua `false`. O GAP restante é recorrência/assinaturas. Permanecem PARTIAL a composição de autoridade Business → Payments, observabilidade financeira completa, provider/browser E2E implantado, limiter distribuído e fechamento operacional de release/rollback. Affiliates permanece separado e não recebe autoridade financeira implícita.

"""
tracker = tracker[:section_start] + payments_section + tracker[section_end:]
tracker_path.write_text(tracker)

evidence_path.write_text(
    """# PAYMENTS M149 — Browser Checkout Launch / Confirmation Evidence

## Objective

M149 implements the Payments-owned browser checkout client that was still missing after the M146 backend financial slice. The work started in parallel on the historical branch `feat/payments-m148-browser-checkout`; after Ticketing M148 became canonical and merged, PR #226 was renumbered to M149 without rewriting branch history.

## Executable browser contract

- consumes a normalized Business commercial checkout handoff without moving financial authority into Business;
- derives the exact `business:<sessionId>:<planId>` idempotency key;
- accepts exactly one create-authority model already audited by M139: authenticated CSRF + exact Business scope, or a server-issued checkout-handoff capability;
- never mints guest HMAC capability or exposes server signing material in browser code;
- creates through `POST /api/payments/v1/checkouts` with same-origin credentials and bounded JSON parsing;
- keeps the plaintext status capability private to the client closure and out of local/session storage;
- opens the provider checkout with `noopener,noreferrer`, using location fallback only when popup creation is blocked;
- preserves the V1 polling budget of 2500 ms × 240 attempts;
- treats `CONFIRMED` without authoritative `verifiedPayment` as incomplete and continues polling;
- fails closed on checkout/session identity substitution, terminal failure and timeout;
- emits the existing Business-compatible `businessPaymentVerified` and `businessPaymentVerificationFailed` signals without granting either signal financial mutation authority.

## Authority boundary

M149 does not auto-wire the public `businessCheckoutRequested` event into Payments. The current Business onboarding can produce the handoff, but it has no legitimate public browser source for create authority. Guest signing remains a server-only HMAC operation backed by secret material, while authenticated create requires a real platform session, same-origin mutation protection, CSRF and exact `X-Business-ID` scope.

Adding an HMAC secret to the browser, fabricating CSRF, inferring Business authority or introducing anonymous checkout would regress M139. A later authority-bootstrap/composition milestone must provide one of M139's existing authority models before live Business checkout is connected.

## Permanent evidence

`Payments M149 Browser Checkout Contract` builds the workspace, runs the focused client unit contract and launches deterministic Chromium. The browser proof validates launch headers/idempotency, private status-token reuse, bounded polling, authoritative confirmation, Business success/failure signalling, safe popup behavior, blocked-popup fallback, zero storage persistence of the status capability and zero page errors.

Final promotion additionally requires repository-wide Quality on the same final head/merge ref. Backend Payments contracts remain authoritative and are not replaced by this browser proof.

## Migration result

```text
PASS     27
PARTIAL   5
GAP       1
N/A       1
TOTAL    34
```

`FEATURE-0009` / `MIG-0010` remain `migrating`. The remaining GAP is subscription lifecycle. Business → Payments authority composition, financial observability, deployed provider/browser E2E, distributed rate limiting and release/rollback completion remain PARTIAL.

## Rollback

The M149 adapter is additive and has no schema or provider mutation authority of its own. Removing browser composition/client usage leaves M139–M146 server-side Ordering/Financial state, verified results, reconciliation and immutable ledger history intact. No rollback may delete or rewrite financial evidence.
"""
)
