# CRM M137 — Canonical Meetings Browser Surface

## Objective

Remove the stale duplicate read-only Meetings implementation from the CRM shell now that `apps/admin-crm/public/meetings.html` is the canonical authenticated Meetings browser lifecycle.

## Base

- repository: `luizidebook/touristic-digital-platform`
- refreshed base: `main@97454fdd1173af2460757f8e9c18e9ff2d7dd4c2`
- superseded draft: PR #213 / `feat/crm-m137-remove-legacy-meetings-shell`
- refreshed branch: `feat/crm-m137-canonical-meetings-refresh`

The previous M137 draft had a successful Quality Gate on an older base, but its head had diverged materially from current `main`. This refreshed candidate preserves the same browser contract on top of the current repository state rather than merging a stale-base branch.

## Scope

- keep the sidebar link to `/apps/admin-crm/public/meetings.html`;
- remove the duplicate `#meetings-view` markup from the shell;
- remove duplicate Meetings fetch/render state and hash routing from `shell.js`;
- keep Dashboard and Leads as the only hash-routed shell views;
- add permanent contract assertions proving the canonical Meetings URL remains present and the duplicate lifecycle cannot silently return.

## Explicit non-scope

M137 does not change:

- CRM domain or MySQL persistence;
- authenticated CRM HTTP routes;
- platform Auth/session/CSRF behavior;
- Meetings lifecycle semantics or server-authoritative transitions;
- Trials notification claiming, lease ownership, heartbeat, stale-claim recovery or stable provider idempotency keys;
- Follow-up scheduler ownership/idempotency;
- public Proposal/Contract capability-token behavior;
- Feature Registry or migration-equivalence claims.

## Preserved CRM safety contracts

The change is browser-only. Durable server invariants established by the preceding CRM milestones remain untouched, including:

- owner-only claim release/finalization;
- stale-claim recovery through bounded durable leases;
- lease heartbeat during long-running trial notification delivery;
- stable logical provider idempotency identity across retry and stale-claim recovery;
- fail-closed provider-deduplication capability enforcement;
- server-authoritative Meetings state transitions.

## Permanent executable evidence

`apps/morro-digital-platform/src/crm-admin-shell-contract.test.ts` now proves that:

1. the CRM shell still exposes the canonical Meetings navigation URL;
2. the shell no longer contains `id="meetings-view"`;
3. `shell.js` no longer recognizes `#meetings` as a shell route;
4. duplicate `loadMeetings` and `renderMeetings` lifecycles are absent;
5. shared browser Auth/session behavior remains in place.

## Promotion rule

Keep the pull request in draft until the final branch head has a complete successful Quality Gate and all applicable CRM/Auth regressions are green on the same SHA. Before merge, revalidate current `main`, PR state and checks again and confirm the diff contains only permanent CRM M137 files.
