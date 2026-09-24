# Control Center W1 Recovery Matrix — 2026-09-24

**ChangeSet:** `MD-W1-CONTROL-CENTER-GAP`  
**Base:** `main@b92fbc17fa383defd95274a3dea607895fe7e6dd`  
**Purpose:** executable decomposition of historical Control Center deltas without restoring old branches wholesale.

## Status vocabulary

- `ALREADY_IN_MAIN`: current main already contains the intended behavior or a newer equivalent.
- `STILL_NEEDED`: behavior is absent or incomplete and remains valid.
- `SUPERSEDED`: intent has been replaced by a newer implementation or architecture.
- `INVALID`: historical change is no longer a valid merge target.
- `NEEDS_REDESIGN`: original intent remains useful but the old implementation must not be restored as-is.

## Capability matrix

| Capability | #154 | #171 | #176 | #180 | #234 | Current-main evidence | Current classification | Next action |
|---|---|---|---|---|---|---|---|---|
| Users | foundation | — | — | — | expanded UX/entity 360 | `admin-api.mjs`, `control-center.js` | ALREADY_IN_MAIN | hardening only; no old-code recovery |
| Businesses | foundation + profile adapter | — | — | — | entity 360/aggregate work | `business-api.mjs`, Business adapter, Auth-derived directory | NEEDS_REDESIGN | CC-W2 durable Business owner completion |
| Affiliates | gap in original foundation | owner surface | — | — | integrated/visual work | affiliate runtime + adapter + browser workflow | ALREADY_IN_MAIN | close #171 after matrix acceptance |
| CRM | partial | — | — | — | owner-backed aggregate work | CRM adapter delegates to existing CRM API | STILL_NEEDED | CC-W3 capability-by-capability completion |
| Products | foundation namespace | — | — | — | integrated UI/aggregate | Ticketing inventory/offer adapter | ALREADY_IN_MAIN | no recovery from old branches |
| Reservations | foundation namespace | — | — | — | integrated UI/aggregate | Ticketing reservation adapter | ALREADY_IN_MAIN | no recovery from old branches |
| Ticketing | partial | — | — | — | integrated UI/aggregate | Ticketing adapter to owner API | STILL_NEEDED | CC-W4 full operator contract inventory |
| Orders | partial | — | — | — | financial/entity views | Financial/Ordering owner reads | ALREADY_IN_MAIN | keep read-side authority |
| Financial | mature slice | — | — | — | aggregate/UI | Financial adapter; production effects blocked | ALREADY_IN_MAIN | preserve authority; no parallel finance |
| Content | gap in original foundation | — | temporary format qualification | — | integrated/visual work | Content runtime + adapter + contract workflow | ALREADY_IN_MAIN | close #176 |
| Destinations | gap in original foundation | — | — | owner surface | integrated/visual work | Destinations runtime + adapter + contract workflow | ALREADY_IN_MAIN | close #180 |
| Support | foundation | inherited | inherited | inherited | expanded UX | signed support context in `admin-api.mjs` | ALREADY_IN_MAIN | maintain actor/effectiveUser invariant |
| Audit | runtime-only in early foundation | inherited | inherited | inherited | durable aggregate/activity | MySQL append-only audit store | ALREADY_IN_MAIN | update stale docs only in later docs wave |
| System | foundation | inherited | inherited | inherited | integrated UI | platform-operations projection | ALREADY_IN_MAIN | remain read-only unless owner contract exists |
| Settings | basic/preferences | — | — | — | visual/settings surface | local Control Center preferences | ALREADY_IN_MAIN | do not invent privileged config authority |

## PR-level recovery matrix

### PR #154

| Delta | Classification | Evidence / rationale | Recovery |
|---|---|---|---|
| Control Center shell | ALREADY_IN_MAIN | `apps/control-center/public/*` exists in current main | none |
| platform capability model | ALREADY_IN_MAIN | centralized server-side capability checks exist | none |
| Admin API v1 | ALREADY_IN_MAIN | `admin-api.mjs` active in runtime | none |
| Users directory | ALREADY_IN_MAIN | Auth-backed admin user APIs + UI | none |
| Business directory/profile | NEEDS_REDESIGN | profile adapter exists but default runtime repository is in-memory and directory partly derives from Auth memberships | CC-W2 |
| Support Mode | ALREADY_IN_MAIN | signed support context, actor/effectiveUser separation | none |
| append-only audit | ALREADY_IN_MAIN | MySQL audit store now exists | none |
| step-up auth | ALREADY_IN_MAIN | implemented for critical flows | none |
| Affiliates/Content/Destinations gaps listed by #154 | SUPERSEDED | those owner adapters now exist | none |
| browser proof gap listed by #154 | SUPERSEDED | current browser/a11y workflows exist, but visual evidence still needs current-main wave | CC-W5 only for current gaps |

**PR action:** do not merge. Safe to close after this matrix is accepted.

### PR #171

| Delta | Classification | Evidence / rationale | Recovery |
|---|---|---|---|
| affiliate list/detail owner queries | ALREADY_IN_MAIN | affiliate admin runtime/service integrated | none |
| membership eligibility/attribution/conversions reads | ALREADY_IN_MAIN | current affiliate query surface is owner-backed | none |
| suspend/reactivate membership | ALREADY_IN_MAIN | governed adapter mutation exists | none |
| server-side capability/step-up/support denial | ALREADY_IN_MAIN | present in `admin-api.mjs` | none |
| browser contract | ALREADY_IN_MAIN | dedicated workflow exists | none |

**PR action:** do not merge. Safe to close after this matrix is accepted.

### PR #176

| Delta | Classification | Evidence / rationale | Recovery |
|---|---|---|---|
| formatting-only qualification patch | INVALID | PR explicitly declared itself temporary and not a merge candidate | none |
| Content owner admin intent | ALREADY_IN_MAIN | current Content runtime/adapter/contract workflow exists | none |

**PR action:** close. No code recovery required.

### PR #180

| Delta | Classification | Evidence / rationale | Recovery |
|---|---|---|---|
| typed Destination owner boundary | ALREADY_IN_MAIN | current destinations package/service/runtime exists | none |
| MySQL repository | ALREADY_IN_MAIN | current destination service and workflow use MySQL contract | none |
| admin adapter | ALREADY_IN_MAIN | destination adapter exists | none |
| fail-closed owner availability | ALREADY_IN_MAIN | destination runtime readiness/adapter behavior present | none |
| public projection integration | ALREADY_IN_MAIN or SUPERSEDED | current main has newer destination/public runtime work | no direct cherry-pick |
| historical browser qualification details | SUPERSEDED | current workflow should be source of truth | none |

**PR action:** do not merge. Safe to close after this matrix is accepted.

### PR #234

| Delta | Classification | Evidence / rationale | Recovery |
|---|---|---|---|
| Control Center core runtime | ALREADY_IN_MAIN | current main contains shell, API and adapters | none |
| owner-backed aggregates | ALREADY_IN_MAIN | current adapters and dashboard module state exist | none |
| Users/Business/Affiliate entity 360 patterns | ALREADY_IN_MAIN / NEEDS_REDESIGN | relationship/activity patterns exist; Business durability still incomplete | CC-W2 only for Business gap |
| universal search intent | ALREADY_IN_MAIN / NEEDS_REDESIGN | current search aggregation exists; old split module files are absent | validate current behavior, do not restore module wholesale |
| UX V1 primitives/shell modules | SUPERSEDED | historical files absent while current main contains newer Control Center home and wider UX V2 evolution | no direct recovery |
| responsive harness from historical branch | NEEDS_REDESIGN | historical path absent; current UI has changed | CC-W5 |
| visual regression harness/baselines | STILL_NEEDED | historical harness/workflow absent from current main | CC-W5 fresh baselines |
| historical screenshots/baselines | INVALID as current authority | belong to old markup/branch state | regenerate from current exact head |
| Control Center ledger | STILL_NEEDED | historical ledger file absent | CC-W6 |
| unrelated branch-wide changes | INVALID for this recovery | #234 is a long-lived, highly divergent branch with broad unrelated deltas | never merge wholesale |

**PR action:** do not merge. Close only after successor waves capture the still-needed visual/UX/documentation intent.

## Owner-boundary execution map

| Namespace | Current owner/delegate | Write authority | Placeholder/fallback risk | Required follow-up |
|---|---|---|---|---|
| Users | Auth | Auth | low | keep server-side capability and step-up |
| Businesses | Business + Auth membership projection | Business for profile | **medium**: in-memory profile repository default; incomplete canonical registry | CC-W2 |
| Affiliates | Affiliates | Affiliates | low | none for historical recovery |
| CRM | CRM | CRM | medium: admin breadth not fully inventoried | CC-W3 |
| Products | Ticketing | Ticketing | low | no new Commerce authority here |
| Reservations | Ticketing | Ticketing | low | maintain owner state machine |
| Ticketing | Ticketing | Ticketing | medium: operator breadth incomplete | CC-W4 |
| Orders | Ordering/Financial projections | existing owners | low | read-side only in Control Center |
| Financial | Financial | Financial | low if current production block retained | preserve monetary authority |
| Content | Content | Content | low | none for historical recovery |
| Destinations | Destinations | Destinations | low | none for historical recovery |
| Support | Control Center orchestration + Auth identities | no domain write authority | low | preserve actor/effectiveUser separation |
| Audit | Analytics audit store | append-only audit | low | maintain fail-closed governed mutations |
| System | platform operations projection | none | low | keep read-only |
| Settings | browser preference surface | local preferences only | low | redesign before any privileged server setting |

## Auth/server-authority proof obligations for successor waves

### CC-W2 Business

- allow authorized platform/business operator path;
- deny unauthorized capability;
- deny cross-tenant mutation;
- prove durable repository composition;
- prove canonical Business IDs are owner-issued;
- prove Auth membership data is not treated as the full Business source of truth;
- audit old/new state for mutation.

### CC-W3 CRM

- enumerate each mutation;
- verify CRM owner command handles it;
- deny cross-tenant access;
- preserve Support Mode actor/effectiveUser semantics;
- do not introduce Control Center SQL.

### CC-W4 Ticketing

- owner command only;
- invalid-state denial;
- replay/idempotency protection where applicable;
- cross-business/cross-destination denial;
- no direct payment/order state mutation;
- audit correlation to owner operation.

## Browser/accessibility/visual proof obligations for CC-W5

For each Control Center surface:

1. login and route load;
2. loading / empty / success / error state;
3. keyboard reachability;
4. visible focus;
5. no critical axe violation;
6. mobile `390x844`;
7. tablet `768x1024`;
8. desktop `1280x800` or larger;
9. table overflow without viewport breakage;
10. no overlap with navigation, banners or dialogs;
11. reduced-motion compliance where motion exists;
12. fresh screenshot/baseline bound to the tested exact HEAD.

Historical #234 screenshots must not be copied forward as evidence.

## Recommended wave order

1. **CC-W2 Business owner completion**
2. **CC-W3 CRM admin completion**
3. **CC-W4 Ticketing operator completion**
4. **CC-W5 visual/responsive/accessibility certification**
5. **CC-W6 documentation convergence**

CC-W2 through CC-W4 may proceed in parallel only if ownership is split cleanly and shared `admin-api.mjs` / `admin-domain-adapters.mjs` edits are coordinated to avoid semantic collisions.

## Closure ledger

| PR | Merge? | Close after this wave? | Reason |
|---|---:|---:|---|
| #154 | NO | YES | foundation superseded by more advanced main |
| #171 | NO | YES | Affiliates delta already present |
| #176 | NO | YES | temporary non-merge qualification PR |
| #180 | NO | YES | Destinations delta already present |
| #234 | NO | NOT YET | remaining current-main visual/UX/docs intent must first be captured by successor waves |

## ChangeSet invariant

The final diff for `MD-W1-CONTROL-CENTER-GAP` must contain exactly these owned files:

- `docs/control-center/W1-GAP-AUDIT-2026-09-24.md`
- `docs/control-center/W1-RECOVERY-MATRIX-2026-09-24.md`

No runtime change is authorized in this wave.
