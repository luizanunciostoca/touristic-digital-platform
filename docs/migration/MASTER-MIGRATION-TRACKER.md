# Master Migration Tracker — V2 final documentary truth

## Purpose

This document is the canonical human-readable rollup of the V1 → Touristic Digital Platform migration. It reconciles the machine-readable Feature Registry, detailed migration matrices, architecture ownership, QA evidence and release/rollback documentation without converting implementation equivalence into a production-release claim.

Final audit baseline: `main@ec4f51e0198cdeed51b37fabe5ed94ebb2e3ecb6` (PR #279 merged).

No runtime state is inferred from this document. GitHub Actions availability is an execution/promotion concern and does not change the evidence already merged into `main`.

## Documentary authority hierarchy

When documents differ, current status is resolved in this order:

1. `docs/features/registry.json` — machine-readable Feature lifecycle state;
2. this Master Migration Tracker — canonical migration rollup and Feature ↔ MIG reconciliation;
3. the current per-domain migration/capability matrix — detailed PASS/PARTIAL/GAP evidence;
4. QA evidence and merged PR records — proof for a particular checkpoint;
5. runbooks/release documents — activation and rollback requirements;
6. historical milestone prose — supporting history only; it must never override a later canonical state.

A historical QA file or milestone section can remain valid evidence for the checkpoint it describes while being superseded as a statement of current status.

## State semantics

Migration states are:

`discovered` → `mapped` → optional evidence checkpoint `snapshotted` → `migrating` → `equivalent` → `released`

- `discovered` — scope exists, but approved product/domain contracts are not complete enough for implementation.
- `mapped` — ownership, source and target boundaries are mapped; implementation/evidence is not complete.
- `migrating` — implementation exists but one or more required contracts/evidence remain PARTIAL/GAP or otherwise unproven.
- `equivalent` — applicable approved behavior/API/visual/persistence/security contracts are evidenced and rollback exists. It does **not** mean production release.
- `released` — the Definition of Released in `docs/product-architecture/RELEASE-PROCESS.md` is satisfied with production deployment and operational evidence.

`snapshotted` is retained only as an optional migration evidence checkpoint. It is not used as the final rollup state of any active Feature below.

Feature Registry `planned` is a product-planning state. For `FEATURE-0010`, `planned` corresponds to migration state `MIG-0011 = discovered`; no Affiliate runtime is authorized.

Current final-state distribution:

- `discovered`: MIG-0011 only;
- `mapped`: none as a current final state;
- `migrating`: MIG-0010 only;
- `equivalent`: all other active MIG rows listed below;
- `released`: none — the repository does not contain sufficient production evidence to promote any Feature to this state.

## Feature Registry rollup

| Feature | Name | Registry state | Migration truth | Canonical evidence | Release truth |
|---|---|---|---|---|---|
| FEATURE-0001 | Mapa Interativo | `equivalent` | MIG-0004/MIG-0012/MIG-0015 `equivalent` | Geospatial/Mapbox evidence recorded by PRs #17/#20 and tracker-linked gates | not `released` |
| FEATURE-0002 | Busca e Descoberta | `equivalent` | final Search matrix is complete; no new MIG ID is invented | `SEARCH-MIGRATION-MATRIX.md`, M44 evidence | not `released` |
| FEATURE-0003 | Navegação e Rotas | `equivalent` | MIG-0005 `equivalent` | `NAVIGATION-MIG-0005-EQUIVALENCE-MATRIX.md` — 24 PASS / 0 PARTIAL / 0 GAP | not `released` |
| FEATURE-0004 | Assistente Digital | `equivalent` | MIG-0006 `equivalent` | `ASSISTANT-MIGRATION-MATRIX.md` final M35 closure | not `released` |
| FEATURE-0005 | Business Portal | `equivalent` | MIG-0007 `equivalent` | `BUSINESS-MIGRATION-MATRIX.md` — 19 PASS / 0 PARTIAL / 0 GAP / 1 N/A | not `released` |
| FEATURE-0006 | CRM Administrativo | `equivalent` | MIG-0008 `equivalent` | `CRM-MIGRATION-MATRIX.md` — 24 PASS / 0 PARTIAL / 0 GAP / 1 N/A | not `released` |
| FEATURE-0007 | Design System | `equivalent` | MIG-0001/0002/0003/0013/0014/0016 `equivalent` | frozen V1 CSS/shell evidence + PR #263 token closure | not `released` |
| FEATURE-0008 | Autenticação e Sessão | `equivalent` | MIG-0009 `equivalent` | `AUTH-MIGRATION-MATRIX.md` — 20 PASS / 0 PARTIAL / 0 GAP / 0 N/A | not `released` |
| FEATURE-0009 | Pagamentos e Assinaturas | `migrating` | MIG-0010 `migrating` | `PAYMENTS-MIGRATION-MATRIX.md` — **30 PASS / 3 PARTIAL / 0 GAP / 1 N/A** | not equivalent; not released |
| FEATURE-0010 | Programa de Afiliados | `planned` | MIG-0011 `discovered` | `AFFILIATES-MIGRATION-MATRIX.md` — **3 PASS / 2 PARTIAL / 10 GAP / 2 N/A** | no runtime; not equivalent; not released |
| FEATURE-0011 | Ticketing e Check-in | `equivalent` | MIG-0017 `equivalent` | `TICKETING-MIGRATION-MATRIX.md`, PR #276 + documentary reconciliation PR #279 | not `released` |

`FEATURE-0002` has no dedicated MIG ID in the existing tracker lineage. This reconciliation records the already-approved Feature state and its current Search matrix instead of inventing a new migration identifier retroactively.

## Canonical MIG tracker

| MIG | Feature | Domain / source | Target | Final state | Evidence / unresolved truth |
|---|---|---|---|---|---|
| MIG-0001 | FEATURE-0007 | Core UI / `index.html` | `apps/morro-digital-platform` | `equivalent` | Home V1 × V2 visual/behavioral evidence |
| MIG-0002 | FEATURE-0007 | V1 CSS | `packages/design-system/src/legacy` | `equivalent` | preserved legacy CSS/import evidence |
| MIG-0003 | FEATURE-0007 | V1 CSS variables | `packages/design-system/src/tokens` | `equivalent` | 41 V1 custom properties canonically mapped by PR #263 without runtime CSS mutation |
| MIG-0004 | FEATURE-0001 | V1 map runtime | `packages/geospatial` | `equivalent` | real Mapbox, fallback, lifecycle and visual evidence |
| MIG-0005 | FEATURE-0003 | V1 Navigation | `packages/navigation` + Geospatial/app adapters | `equivalent` | 24/24 mandatory scenarios PASS |
| MIG-0006 | FEATURE-0004 | V1 Assistant | `packages/assistant` + app/server adapters | `equivalent` | final Assistant matrix all applicable rows PASS |
| MIG-0007 | FEATURE-0005 | Business Portal | `packages/business` + app surfaces | `equivalent` | 19 PASS / 0 PARTIAL / 0 GAP / 1 N/A |
| MIG-0008 | FEATURE-0006 | frozen CRM V1 | `@touristic/crm`, `@touristic/crm-server`, `apps/admin-crm` | `equivalent` | 24 PASS / 0 PARTIAL / 0 GAP / 1 N/A; PRs #260/#266 |
| MIG-0009 | FEATURE-0008 | Auth/session | Auth server/browser + dashboard surfaces | `equivalent` | 20 PASS / 0 PARTIAL / 0 GAP / 0 N/A |
| MIG-0010 | FEATURE-0009 | Payments/subscriptions | Ordering + Financial + Payments runtime composition | `migrating` | **30 PASS / 3 PARTIAL / 0 GAP / 1 N/A**; see exact residuals below |
| MIG-0011 | FEATURE-0010 | V2-native Affiliates discovery | future Affiliate domain only after approval | `discovered` | **3 PASS / 2 PARTIAL / 10 GAP / 2 N/A**; no `packages/affiliates` or `services/affiliates` runtime is authorized |
| MIG-0012 | FEATURE-0001 | V1 map bootstrap | Geospatial + app bootstrap | `equivalent` | real provider/fallback/rollback evidence |
| MIG-0013 | FEATURE-0007 | Home / tour selector | app browser entry | `equivalent` | Home manifest/behavior evidence |
| MIG-0014 | FEATURE-0007 | V1 tour data | tour catalog/localization | `equivalent` | 3 routes / 18 stops / multilingual content preserved |
| MIG-0015 | FEATURE-0001 | V1 markers/map center | tour markers/selection | `equivalent` | atomic switching/camera/rollback evidence |
| MIG-0016 | FEATURE-0007 | V1 tour keyword resolver | tour search | `equivalent` | aliases/normalization/fallback tests |
| MIG-0017 | FEATURE-0011 | V2-native Ticketing / no authoritative V1 parity baseline | `@touristic/ticketing` + `@touristic/ticketing-server` + runtime integration | **`equivalent`** | final Ticketing matrix PASS across approved capabilities; PR #276 implementation evidence and PR #279 registry/matrix reconciliation; release remains separate |

## FEATURE-0009 / MIG-0010 — exact current Payments truth

PR #267 / M153 is merged. The current matrix truth is therefore no longer a pre-merge candidate:

```text
PASS      30
PARTIAL    3
GAP        0
N/A        1
TOTAL     34
```

The three remaining `PARTIAL` rows are exactly:

1. **Financial audit/observability** — durable financial audit/reconciliation evidence exists, but payment/recurrence operation signals are not yet fully emitted through the canonical `PLATFORM-OBSERVATION` contract.
2. **Deployed third-party provider/browser E2E** — deterministic local sandbox/provider/browser contracts exist, but a deployed third-party sandbox browser journey is not evidenced.
3. **Rate limiting at real production topology** — bounded in-memory actor/IP limiting exists; a distributed limiter is required only if actual production deployment is horizontally scaled/multi-replica.

Consequences:

- FEATURE-0009 remains `migrating`;
- behavior/visual/API equivalence flags remain `false` in the Registry;
- zero GAP rows do not authorize `equivalent` while the three PARTIAL rows remain unresolved/unproven;
- automatic provider recurring charging and a scheduler are **not** counted as missing implementation because no approved recurring-payment-instrument/provider contract or scheduler policy exists; those semantics remain disabled rather than invented;
- `docs/operations/PAYMENTS-RELEASE-ROLLBACK.md` remains the canonical activation/rollback contract.

## FEATURE-0010 / MIG-0011 — exact current Affiliates truth

FEATURE-0010 remains `planned`; MIG-0011 remains `discovered`.

Canonical discovery score:

```text
PASS       3
PARTIAL    2
GAP       10
N/A        2
TOTAL     17
```

The three PASS rows prove only architecture boundaries:

- Affiliate is a separate platform domain;
- Business does not own/administer Affiliate monetary authority;
- Financial remains the only monetary source of truth.

The two PARTIAL rows are conversion association and commission-entitlement ownership split. The ten GAP rows require approved product/domain contracts before implementation. The two N/A rows deliberately prevent browser/admin runtime before server authority and prohibit an Affiliate-owned payout/payment implementation.

Canonical ownership after reconciliation:

- Affiliate may eventually own platform affiliate identity, referral/attribution evidence, conversion association and the **commercial entitlement** to a commission under an approved versioned policy;
- Financial exclusively owns Payment, ledger, allocation, payable, wallet/financial position, settlement, payout/transfer and monetary reversals;
- Affiliate may affect money only through a future explicit versioned Affiliate → Financial materialization contract accepted under Financial invariants;
- browser/redirect/query/local-storage evidence is never authoritative attribution, conversion or commission state;
- no commission percentage, attribution window, qualifying conversion, formula, lifecycle or reversal policy is assumed by this repository.

See `docs/product-architecture/AFFILIATES-CANONICAL-SCOPE.md`, `docs/migration/AFFILIATES-MIGRATION-MATRIX.md` and `docs/qa/AFFILIATES-FEATURE-0010-DISCOVERY-EVIDENCE.md`.

## FEATURE-0011 / MIG-0017 — final Ticketing truth

PR #276 integrated the approved Ticketing capability on a clean current-main lineage while preserving Ordering/Payments/Financial authority. PR #279 then reconciled the Registry and Ticketing matrix on `main`.

Therefore:

- FEATURE-0011 = `equivalent`;
- MIG-0017 = `equivalent`;
- Ticketing is **not** `released`;
- `docs/qa/TICKETING-M147-EVIDENCE.md` is a historical implementation checkpoint, not the final status authority;
- the current status authority is the Registry + `TICKETING-MIGRATION-MATRIX.md` + this tracker;
- `docs/runbooks/TICKETING-FEATURE-0011-RELEASE.md` governs activation/rollback and must not be read as proof that production activation already occurred.

## Release evidence index

This is an index of the strongest current documentary/equivalence evidence. It is **not** a production deployment ledger.

| Feature | Current state | Equivalence / migration evidence | Release / rollback document | Production release evidence |
|---|---|---|---|---|
| FEATURE-0001 | equivalent | Geospatial Mapbox/visual/provider evidence; PRs #17/#20 | platform release process | none consolidated; no `released` claim |
| FEATURE-0002 | equivalent | `SEARCH-MIGRATION-MATRIX.md`, M44 | platform release process | none consolidated; no `released` claim |
| FEATURE-0003 | equivalent | `NAVIGATION-MIG-0005-EQUIVALENCE-MATRIX.md`, PRs #49/#52/#53/#54/#55 | platform release process | none consolidated; no `released` claim |
| FEATURE-0004 | equivalent | `ASSISTANT-MIGRATION-MATRIX.md`, final M35 evidence | platform release process | none consolidated; no `released` claim |
| FEATURE-0005 | equivalent | `BUSINESS-MIGRATION-MATRIX.md`, `docs/qa/BUSINESS-M65-EVIDENCE.md` | platform release process | none consolidated; no `released` claim |
| FEATURE-0006 | equivalent | `CRM-MIGRATION-MATRIX.md`, `docs/qa/CRM-M141-EQUIVALENCE-EVIDENCE.md`, PRs #260/#266/#269 | platform release process | none consolidated; no `released` claim |
| FEATURE-0007 | equivalent | V1 shell/CSS evidence + PR #263 token closure | platform release process | none consolidated; no `released` claim |
| FEATURE-0008 | equivalent | `AUTH-MIGRATION-MATRIX.md`, Auth browser/integration evidence | platform release process | none consolidated; no `released` claim |
| FEATURE-0009 | migrating | `PAYMENTS-MIGRATION-MATRIX.md`, PR #267 / M153 | `docs/operations/PAYMENTS-RELEASE-ROLLBACK.md` | insufficient for equivalence/release; three PARTIAL remain |
| FEATURE-0010 | planned / MIG discovered | Affiliate canonical scope, matrix and discovery evidence | release contract not yet authorized | none; runtime intentionally absent |
| FEATURE-0011 | equivalent | `TICKETING-MIGRATION-MATRIX.md`, PRs #276/#279 | `docs/runbooks/TICKETING-FEATURE-0011-RELEASE.md` | no production activation evidence; not `released` |

Global release criteria are defined only by `docs/product-architecture/RELEASE-PROCESS.md`. Its Definition of Released requires stable production, metrics within limits, critical reconciliation and published release documentation. No current Feature is promoted to `released` by this audit.

## Superseded / historical status sources

The following are valid historical evidence where applicable but are not current status authority:

- the pre-#276 MIG-0017 tracker row that described Ticketing as `migrating`; superseded by #276 + #279 and this reconciliation;
- Ticketing PRs #265/#270; explicitly superseded for promotion by PR #276;
- `docs/qa/TICKETING-M147-EVIDENCE.md` when read as a final Ticketing status claim; it remains supporting historical evidence only;
- Payments M135–M152/M149 checkpoint scores when read as current FEATURE-0009 status; current score is M153 = 30/3/0/1 after merged PR #267;
- the Business matrix sentence that said FEATURE-0009 was `planned`; FEATURE-0009 is now `migrating` and Payments-owned execution remains N/A for Business;
- the old Affiliate wording in Domain Map / Module Contracts / Capability Matrix assigning Affiliate-owned wallet/payout authority; the canonical boundary now keeps every monetary mutation in Financial;
- historical Assistant/Search/Navigation milestone sections that describe an earlier incomplete state; the final matrix conclusion and Registry state govern current truth;
- historical Wave 4 wording that described MIG-0014 as pending; current MIG-0014 is `equivalent`.

No historical file is deleted solely for being historical. It must be interpreted according to the authority hierarchy above, and any future status-bearing document must link back to the Registry/Tracker/matrix rather than create a competing lifecycle truth.

## Unique external blockers

This is the single external-blocker list for the final V2 documentary checkpoint. Internal unfinished engineering is separated below.

| ID | External blocker | Affects | Resolution evidence required |
|---|---|---|---|
| EXT-001 | GitHub Actions is currently unavailable/returning the repository-level startup failure instead of executable named checks | current documentary PR and other pending PRs | exact-head official checks execute normally again; until then no CI-dependent promotion claim is made |
| EXT-002 | deployed third-party Payments sandbox/browser environment and provider-side evidence are not available in the repository | FEATURE-0009 equivalence | safe deployed third-party sandbox journey with authoritative persisted Financial result/readback |
| EXT-003 | real production Payments topology is not yet proven for rate-limit architecture | FEATURE-0009 equivalence / production safety | deployment evidence proving single replica, or a shared/distributed limiter if horizontally scaled |
| EXT-004 | Affiliate product/commercial/legal policy is not approved/versioned | FEATURE-0010 implementation | identity/eligibility, referral trust, attribution subject/precedence/window, qualifying conversion, commission formula/state/reversal, Financial materialization, RBAC/privacy/retention and operational criteria approved |
| EXT-005 | production rollout/operations evidence required by the Definition of Released is not consolidated | every Feature state `released` | immutable release identity, staging/go-no-go, production rollout, stable health/metrics/reconciliation and published release record |

Not an external blocker, but still an internal FEATURE-0009 PARTIAL: canonical payment/recurrence `PLATFORM-OBSERVATION` integration remains incomplete. It must be closed by the relevant implementation workstream without changing the documentary score early.

Platform production-readiness PR #268 remains a separate open runtime/hardening workstream and is not modified by this documentary reconciliation.

## Final V2 documentary checklist

- [x] `main` revalidated at `ec4f51e0198cdeed51b37fabe5ed94ebb2e3ecb6` before this reconciliation.
- [x] Feature Registry reviewed; FEATURE-0009 = `migrating`, FEATURE-0010 = `planned`, FEATURE-0011 = `equivalent`.
- [x] All current migration/equivalence matrices reviewed: Assistant, Auth, Business, CRM, Navigation, Payments, Search, Ticketing, plus the Affiliate discovery matrix prepared in this documentary PR.
- [x] MIG-0017 reconciled to `equivalent` with FEATURE-0011; no `released` claim added.
- [x] Payments truth frozen at 30 PASS / 3 PARTIAL / 0 GAP / 1 N/A.
- [x] Affiliates truth frozen at 3 PASS / 2 PARTIAL / 10 GAP / 2 N/A, FEATURE `planned`, MIG `discovered`.
- [x] Affiliate financial ownership drift removed: Financial remains exclusive monetary authority.
- [x] Domain Map, Module Contracts and Capability Matrix aligned to the Affiliate boundary without runtime implementation.
- [x] QA evidence reviewed as checkpoint evidence, not as automatic production readiness.
- [x] Payments and Ticketing release/rollback documents reviewed; platform Definition of Released remains authoritative.
- [x] Historical/superseded status sources identified and demoted from current-status authority.
- [x] Release evidence index consolidated without asserting production deployment.
- [x] External blockers consolidated into one list.
- [x] No runtime code, schema, business rule, payment authority or provider behavior changed by this reconciliation.
- [ ] Official exact-head CI gates rerun when GitHub Actions is functional; this is a promotion gate, not a prerequisite for the documentary audit itself.

## Final decision

The V2 documentary truth is internally consistent at this checkpoint:

- **equivalent, not released:** FEATURE-0001 through FEATURE-0008 except FEATURE-0009, plus FEATURE-0011;
- **migrating:** FEATURE-0009 / MIG-0010;
- **planned + discovered:** FEATURE-0010 / MIG-0011;
- **released:** none.

No document may claim production readiness or `released` solely from equivalence, a merged PR, zero GAP rows, a historical green check, or a release runbook. Production status requires the explicit release evidence defined by `RELEASE-PROCESS.md`.