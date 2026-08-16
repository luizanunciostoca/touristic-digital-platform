# Assistant Runtime — client cancellation and input safety hardening

## Scope

This increment hardens only the paid Assistant runtime boundary. It does not change Ordering, Payments, Financial, CRM, Business, browser UI, provider pricing policy, or the durable governor contract introduced by the earlier Assistant runtime-safety work.

Baseline: `main@17479a909b942c3eb211c110ca78e0986864bea4`, after the merged durable governance and model-bound priced-reservation hardening.

## Guarantees added

1. A client disconnect is propagated to an in-flight OpenAI request through the same `AbortController` used for provider timeouts.
2. If the client is already aborted before provider execution, no provider budget is reserved and no paid provider request is attempted.
3. If the client disconnects after the paid provider attempt begins, the reservation is settled conservatively when actual provider usage is unavailable. Cancellation therefore never becomes an implicit zero-cost assumption.
4. The runtime emits structured `provider.request.failed` telemetry with reason `client_disconnected` for an interrupted paid attempt and preserves the request correlation ID.
5. A disconnect before provider execution emits `provider.request.cancelled` with reason `client_disconnected_before_provider`.
6. The runtime does not attempt to write a response after it has observed that the client connection closed before `ServerResponse.writableEnded`.
7. Malformed JSON is classified as `400 assistant_invalid_json` instead of a generic provider/runtime failure.
8. Request bodies above the existing 64 KiB ceiling are classified as `413 assistant_request_too_large`.
9. Malformed or oversized requests do not reserve provider budget and do not invoke the paid provider.

## Cancellation semantics

```text
request accepted
→ billing/runtime guards
→ validated JSON body
→ client still connected?
  ├─ no: stop before reserve/provider
  └─ yes: reserve budget durably
           → start provider request
           → client disconnect?
             ├─ yes: abort provider request
             │       → settle reservation conservatively when usage is unknown
             │       → emit correlated failure event
             │       → do not write to closed response
             └─ no: normal provider success/error/timeout flow
```

The runtime intentionally distinguishes client cancellation from the existing 12-second provider timeout. Both terminate the upstream request, but observability records different reasons.

## Financial-safety invariant

A cancellation after the external call has started is an uncertain-billing condition. The internal governor therefore keeps the existing conservative rule: absent confirmed usage, the full request reserve is charged. This may overcount internal provider spend but cannot silently undercount an externally attempted paid request.

## Permanent regression coverage

`apps/morro-digital-platform/tooling/assistant-api-cancellation.test.mjs` proves:

- in-flight client disconnect aborts the provider signal and conservatively settles the reserve;
- a pre-aborted client causes no reserve and no provider call;
- malformed JSON returns 400 with no provider spend;
- oversized input returns 413 with no provider spend.

## Post-reservation pre-provider cancellation follow-up

A later runtime audit identified a narrower cancellation race: the client can disconnect synchronously while the durable reservation is being persisted. At that point `reserve()` has succeeded, but the paid provider has not yet been invoked.

The runtime now distinguishes that state explicitly. If the disconnect is observed after durable reservation but before `fetch` is invoked, it calls the governor's durable `release()` path, emits correlated `provider.request.released` and `provider.request.cancelled` evidence with reason `client_disconnected_before_provider`, and returns without invoking OpenAI. The released state is persisted, so a process restart does not recover that reservation as uncertain spend.

Once the provider invocation has started, the original conservative invariant remains unchanged: a disconnect aborts the in-flight call and, when provider usage is unavailable, settles the full reserve rather than assuming zero external cost.

Permanent regression coverage now also forces a disconnect from inside reservation persistence and proves: zero provider calls, zero spent/reserved budget, zero active request, an empty durable reservation set, correlated release/cancellation events, and zero orphan recovery after a simulated runtime restart.

## Validation history

The first draft Quality attempt correctly stopped on canonical formatting for `assistant-api.mjs`. A one-shot branch-only formatter applied repository Prettier output and removed itself, so no temporary workflow remains in the intended PR diff. The next draft Quality run is the authoritative validation of the formatted head before promotion.

The canonical repository Quality Gate remains authoritative for formatting, architecture, Feature Registry, lint, typecheck, full tests, and build before promotion.
