from __future__ import annotations

import json
from pathlib import Path

matrix_path = Path("docs/migration/BUSINESS-MIGRATION-MATRIX.md")
registry_path = Path("docs/features/registry.json")
tracker_path = Path("docs/migration/MASTER-MIGRATION-TRACKER.md")

matrix = matrix_path.read_text()

replacements = {
    "# Business Portal — Migration Matrix (M64 browser scope reconciliation)": "# Business Portal — Migration Matrix (M65 live runtime semantic parity)",
    "After M64, `FEATURE-0005` remains `baseline-pending`. M63 completed the only frozen production module under `js/business/*`; M64 reconciles that frozen tree and confirms no additional Business-owned browser module remains outside the separately classified onboarding runtime. `Live Business runtime` remains the only partial contract.": "After M65, all audited Business-owned contracts have executable V2 equivalence evidence. The frozen `js/business/*` production scope is complete from M63/M64, and M65 reconciles the final `business-live-runtime.js` responsibilities through explicit semantic events and existing owner ports without restoring legacy globals. `FEATURE-0005` is therefore eligible for `equivalent`; rollout/release remains separate.",
    "| Contract                                | Frozen V1 evidence                                                    | V2 evidence at M64": "| Contract                                | Frozen V1 evidence                                                    | V2 evidence at M65",
    "## M64 score": "## M65 score",
    "- `PASS`: 18\n- `PARTIAL`: 1\n- `GAP`: 0\n- `N/A`: 1\n- total: 20": "- `PASS`: 19\n- `PARTIAL`: 0\n- `GAP`: 0\n- `N/A`: 1\n- total: 20",
    "The official Quality Gate must validate formatting, architecture, Feature Registry, lint, typecheck, tests and build on the final permanent M64 head. M64 is a frozen-scope reconciliation and does not add runtime code.": "`BUSINESS-M65-EVIDENCE.md` and the permanent Business Live Runtime Browser Contract prove the final semantic live-runtime responsibilities, fail-closed location behavior, Assistant delegation, owner-facing focus intents, metric exclusion and absence of legacy browser globals.\n\nThe official Quality Gate and every path-triggered Business browser contract must validate the final permanent M65 head after the registry/tracker reconciliation. No temporary helper workflow or script may remain in the diff.",
}

for old, new in replacements.items():
    if old not in matrix:
        raise SystemExit(f"matrix anchor missing: {old[:80]}")
    matrix = matrix.replace(old, new, 1)

lines = matrix.splitlines()
for index, line in enumerate(lines):
    if line.startswith("| Live Business runtime"):
        lines[index] = "| Live Business runtime | `business-live-runtime.js` | M65 semantic runtime presents the confirmed business on arrival/map/ecosystem, delegates reputation to Assistant, emits explicit owner-facing focus intents, fails closed without coordinates and avoids legacy globals; permanent Chromium contract green | PASS | Preserve observable orchestration through typed V2 events/ports; do not restore global DOM integration or absorb external feature ownership. |"
        break
else:
    raise SystemExit("Live Business runtime row missing")

matrix = "\n".join(lines) + "\n"

old_summary = "`Business profile behavior` remains `PASS` from M63. M64 audits the frozen `js/business/*` tree and proves that its only production module is the profile view already ported in M63, so `Business domain/browser behavior` is now `PASS`. `Live Business runtime` remains the sole `PARTIAL`. `Checkout client` remains `N/A` because provider/payment execution belongs to `FEATURE-0009`. Full Business equivalence is still not claimed."
new_summary = "`Business profile behavior` remains `PASS` from M63 and `Business domain/browser behavior` remains `PASS` from the M64 frozen-tree reconciliation. M65 promotes the final `Live Business runtime` contract to `PASS` through semantic V2 orchestration plus deterministic Chromium evidence. `Checkout client` remains `N/A` because provider/payment execution belongs to `FEATURE-0009`. All Business-owned rows are now PASS, so Business equivalence is claimed at the feature boundary without absorbing Payments-owned execution."
if old_summary not in matrix:
    raise SystemExit("matrix summary anchor missing")
matrix = matrix.replace(old_summary, new_summary, 1)

old_next = "## Next implementation milestone\n\nM65 should audit the sole remaining `PARTIAL`, `Live Business runtime`, responsibility by responsibility. Existing V2 ports for Search, Assistant, Navigation, profile, route, workspace and commercial conversion must be reused; analytics, reputation and notifications must not be fabricated, and legacy browser globals must not be restored.\n\n`FEATURE-0005` remains `baseline-pending` until that final runtime contract is reconciled with executable evidence."
new_next = "## Equivalence state\n\nM65 closes the final Business-owned `PARTIAL`. The matrix is now `19 PASS / 0 PARTIAL / 0 GAP / 1 N/A`; the sole N/A is Payments-owned checkout execution.\n\n`FEATURE-0005` advances to `equivalent`, not `released`. Future Business work must be treated as new scope, release/rollout, or a separately evidenced improvement rather than unfinished V1 parity."
if old_next not in matrix:
    raise SystemExit("matrix next-section anchor missing")
matrix = matrix.replace(old_next, new_next, 1)

matrix_path.write_text(matrix)

registry = json.loads(registry_path.read_text())
feature = next((item for item in registry["features"] if item["id"] == "FEATURE-0005"), None)
if feature is None:
    raise SystemExit("FEATURE-0005 missing from registry")
if feature["status"] != "baseline-pending":
    raise SystemExit(f"unexpected FEATURE-0005 status: {feature['status']}")
feature["status"] = "equivalent"
feature["equivalence"] = {"behavior": True, "visual": True, "api": True}
registry_path.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n")

tracker = tracker_path.read_text()
tracker_lines = tracker.splitlines()
for index, line in enumerate(tracker_lines):
    if line.startswith("| MIG-0007 |"):
        tracker_lines[index] = "| MIG-0007 | Business Portal | Business | FEATURE-0005 | `packages/business` + Business surfaces/adapters in `apps/morro-digital-platform` | 6 | equivalent | dashboard, 28-step onboarding, production profile and browser lifecycle contracts evidenced | 19/19 Business-owned contracts PASS; checkout execution remains Payments-owned N/A | `BUSINESS-MIGRATION-MATRIX.md`; M54–M65 evidence; PR #128 Quality + Business browser contracts | alto |"
        break
else:
    raise SystemExit("MIG-0007 row missing")

tracker = "\n".join(tracker_lines) + "\n"
marker = "## Evidência consolidada — checkpoint Home + Runtime + Geospatial"
addition = "## Business equivalente — MIG-0007\n\nM65 closes the final Business-owned parity contract. The canonical matrix is `19 PASS / 0 PARTIAL / 0 GAP / 1 N/A`; checkout execution is the sole N/A because it belongs to `FEATURE-0009`. The Business feature is `equivalent`, not `released`. See `docs/qa/BUSINESS-M65-EVIDENCE.md` and PR #128 for the final Quality and deterministic Chromium evidence.\n\n"
if addition not in tracker:
    if marker not in tracker:
        raise SystemExit("tracker insertion marker missing")
    tracker = tracker.replace(marker, addition + marker, 1)
tracker_path.write_text(tracker)
