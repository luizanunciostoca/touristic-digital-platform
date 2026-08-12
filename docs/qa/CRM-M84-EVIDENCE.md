# CRM M84 — Follow-ups authenticated boundary

## Scope

M84 introduces the deterministic authenticated Follow-ups domain boundary after the merged Meetings → Proposals → Contracts sequence.

## Frozen V1 behavior reconciled

The frozen CRM V1 at `1915d0260c79f30a63b926a1123e609083587745` exposes authenticated Follow-up settings, list/pending queries, manual creation, mark-sent and mark-responded mutations. Mark-sent records a `follow_up` interaction and updates lead `lastContactAt`; mark-responded records a response interaction. V1 also exposes AI message generation and scheduled automation behavior, which are deliberately not coupled into this milestone.

## V2 M84 contract

- authenticated settings list and save;
- authenticated follow-up list with optional lead filter;
- authenticated pending-work query;
- manual pending follow-up creation with bounded lead/setting/date/attempt validation;
- `pending → sent` with interaction trail and lead last-contact update;
- `sent → responded` with interaction trail;
- viewer/read-only mutation denial through the existing CRM authorization policy;
- structured authorization/input/not-found/transition audit contract;
- no persistence/runtime framework coupling in the domain package.

## Security and ownership

Platform Auth remains authoritative for identity and mutation permission. M84 does not duplicate credentials, cookies, sessions, Origin or CSRF logic. The boundary accepts a platform-verified `AuthSessionIdentity` and remains persistence/transport agnostic.

## Deliberately deferred

- MySQL Follow-ups/settings persistence;
- authenticated HTTP/Node composition;
- scheduled follow-up execution;
- AI-assisted message generation;
- browser Follow-ups/settings UI;
- historical V1 data migration.

## Migration impact

`Follow-up lifecycle` advances from GAP to PARTIAL only after the final helper-free head passes Quality. `Follow-up automation settings` also advances to PARTIAL at the domain-contract layer, but scheduled execution remains GAP. No PASS parity claim is made.

## Promotion rule

Keep the PR draft until the repository Quality Gate and triggered CRM regressions are green on the same final helper-free head, the diff contains only permanent M84 files, and no review thread remains unresolved.
