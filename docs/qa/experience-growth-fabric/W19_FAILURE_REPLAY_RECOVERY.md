# W19 — Failure, Replay & Recovery Acceptance

Status: candidate on the isolated construction branch.

Automated acceptance covers expired lease recovery, transient delivery failure,
bounded backoff, dead-letter transition, duplicate consumer replay, semantic
digest conflict, acquisition command replay, stale reward inventory revision,
unknown risk-policy fail-closed behavior and crash-after-owner-write recovery
rules.

Recovery permits retry only when owner state is confirmed and idempotency
evidence is present.
