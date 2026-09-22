# Morro Digital Control Center — Canonical Engineering Ledger

Status: canonical current-state ledger for the Control Center implementation stack.

This ledger records what the current Control Center architecture is intended to guarantee, which source owns each concern, and which evidence is required before any capability is described as complete. Historical wave notes are not release evidence.

## Authority order

For visual and structural decisions:

1. Morro Digital Control Center — Manual UX Design V1.
2. Approved product overrides: no Quick Actions and no floating Assistant launcher.
3. Current implementation and exact-head browser evidence.
4. Morro Digital Developer UX Design V2 for regression discipline and engineering gates.

For business behavior, authorization and data:

1. domain owner contracts;
2. server-side authorization;
3. persisted canonical ownership;
4. administrative adapters;
5. Control Center projection.

The UI never becomes the authority merely because it displays a capability.

## Architecture

Presentation:

- apps/control-center/public/index.html — administrative shell.
- apps/control-center/public/control-center.css — UX V1 tokens, geometry and responsive layout.
- apps/control-center/public/control-center.js — functional administrative renderer.
- apps/control-center/public/control-center-ux-v1.js — UX V1 composition/decorators.
- apps/control-center/public/control-center-primitives.js — reusable administrative primitives.

Server/admin boundary:

- apps/morro-digital-platform/tooling/admin-api.mjs — administrative API boundary.
- apps/morro-digital-platform/tooling/admin-domain-adapters.mjs — owner-backed domain composition.
- domain services remain the source of truth for their state and mutations.

Visual verification:

- apps/morro-digital-platform/tooling/control-center-visual-fixtures.mjs
- apps/morro-digital-platform/tooling/control-center-visual-regression.mjs
- tests/visual-regression/control-center/baselines
- .github/workflows/control-center-visual-regression.yml
- docs/control-center/VISUAL-REGRESSION.md

## UX authority

The Control Center uses the approved administrative UX V1:

- destination-first context;
- desktop sidebar and topbar shell;
- operational Overview hierarchy;
- reusable list/table treatment;
- Business, Affiliate and User 360 administrative surfaces;
- governed support and critical-action affordances;
- responsive drawer/card/table treatment;
- canonical light palette and spacing scale.

Quick Actions and a floating Assistant launcher are intentionally absent by later product decision. Their absence is not a gap and is tested as an invariant.

## Destination ownership

Destination context is canonical only when supplied by an explicit owner-backed destinationId or an equivalent domain-owned relation.

Never infer ownership or destination scope from:

- display name;
- locationLabel;
- address;
- arbitrary text;
- business name;
- affiliate label.

Records without a canonical destination remain unassigned or unavailable in destination-scoped views rather than being guessed.

The Destination administrative surface manages platform destination configuration. Static public destination configuration may remain as a rollback/fallback path until its dynamic replacement is separately qualified; that fallback does not authorize inferred ownership.

## Affiliates

Affiliates are platform-owned by Morro Digital.

A business does not own an affiliate. Destination membership/assignment is an explicit relationship and may allow one affiliate to promote products from multiple businesses in the same destination.

Financial remains the authority for wallet, settlement, payout and payable state. The Affiliates surface can project commission/entitlement information but does not acquire Financial authority.

## Support Mode

Support Mode preserves two identities:

- actor: the real authenticated administrator;
- effective user: the account being inspected.

A reason is mandatory and the support banner makes the effective context visible.

Support Mode is not credential substitution. Audit must preserve the real actor and effective-user context.

Critical mutations that policy denies during Support Mode remain denied even if their controls are visible. UI visibility never overrides server authorization.

## Security and authorization

Control Center security assumptions:

- authentication is server-backed;
- capabilities are enforced server-side;
- tenant/destination ownership is explicit;
- no direct cross-domain SQL is introduced when an owner adapter exists;
- no secret is rendered to the browser;
- no critical action is authorized only by hiding/showing a button.

Critical actions use the applicable combination of:

- capability check;
- Support Mode restriction;
- step-up authentication;
- reason;
- textual confirmation;
- owner command;
- idempotency where required;
- append-only audit evidence.

Financial, refund, reconciliation, session revocation, role/state mutation, destination governance, ticketing operator actions and affiliate membership changes retain their domain-specific controls.

## Visual baselines

Visual baselines are deterministic test assets, not design authority by themselves.

The baseline matrix is 19 surfaces × 6 exact viewports = 114 PNG images.

Canonical viewports:

- 1440 × 900
- 1280 × 800
- 1024 × 768
- 768 × 1024
- 430 × 932
- 390 × 844

The exact baseline generation environment, hashes and pixel tolerance are recorded in the visual manifest and visual report.

Expected, actual and diff are separate artifacts.

A green visual run means the current exact head matches the reviewed baseline within the narrow documented tolerance. It does not prove domain correctness, authorization or persistence.

## Current manual-compliance ledger

The automated visual report's `manualP0` / `manualP1` counters cover machine-checkable invariants only. They are not a substitute for the full human/manual audit against UX Design V1.

Final-integration reconciliation status:

- **P0 known in code review: 0**; exact-head visual/browser certification is still authoritative.
- **Destination Summary alerts:** reconciled through the owner-backed aggregate path integrated from PR #230. Unavailable/partial owner state is preserved and is not converted to a synthetic zero.
- **Entity 360 tabs:** Business, Affiliate and User now use functional keyboard-accessible tab/tabpanel composition integrated from PR #229.
- **Recent Activity language:** visible activity uses human-readable labels; the original technical action identifier is retained only as non-primary audit metadata for traceability.

These previously recorded P1 integration dependencies are resolved in the combined candidate code. They are not considered visually certified until the exact-head visual comparison and manual review complete successfully.

## Functional and CI evidence

The Control Center release proof is intentionally multi-source.

Relevant gates include, as applicable:

- Quality Gate;
- Security Scanning;
- Dependency Security Audit;
- CI Stale Run Guard;
- Control Center Browser Contract;
- Control Center responsive browser contract;
- Control Center accessibility browser contract;
- Control Center Affiliates Contract;
- Control Center Affiliates Browser Contract;
- Control Center Financial Contract;
- Control Center Financial Browser Contract;
- Control Center Destination Contract;
- domain-specific CRM, Auth, Payments, Ticketing, Business and Content contracts;
- Control Center Visual Regression.

A skipped workflow is not a pass. A passing workflow from another SHA is not exact-head evidence.

## Test commands

Repository qualification:
pnpm check

Visual comparison after the deterministic Control Center runtime is available:
node apps/morro-digital-platform/tooling/control-center-visual-regression.mjs

Explicit baseline regeneration:
node apps/morro-digital-platform/tooling/control-center-visual-regression.mjs --update

See docs/control-center/VISUAL-REGRESSION.md for baseline-governance rules.

## Known intentionally unsupported behavior

Not supported by product decision:

- Quick Actions;
- floating Assistant launcher.

Not supported by authority/security design:

- client-only authorization;
- inferred destination ownership;
- cross-domain direct reads that bypass an available owner boundary;
- arbitrary balance/posting edits;
- arbitrary payment-state mutation;
- arbitrary commission/payout mutation;
- secrets management from browser UI;
- critical mutation that policy blocks during Support Mode.

Not every domain has the same administrative mutation surface. Absence of an action is only a gap when the canonical product/domain contract requires that action and current evidence proves it is missing.

## Evidence discipline

A capability may be labelled complete only when the requirement has a current path through:
requirement → implementation → relevant test → evidence → exact SHA.

Screenshots alone are not sufficient.
Code coverage alone is not sufficient.
Git mergeability alone is not sufficient.
Historical reports are not sufficient.

When main, the stacked base, fixtures, workflow, schema or shared Control Center files change materially, affected evidence is stale until reconciled and rerun.
