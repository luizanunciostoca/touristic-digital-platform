# Ticketing → Notifications Provider-Neutral Bridge — 2026-09-27

## Scope

This micro-release wires authoritative Ticketing fulfillment into the existing durable Notifications runtime without activating any external delivery provider.

## Authority chain

Financial verified outcome
→ Ticketing reservation confirmation
→ Ticket issuance
→ Ticketing owner inventory metadata
→ Destination owner locale
→ Notifications explicit preference
→ durable Notifications outbox

No browser event is accepted as notification authority.

## Fail-closed policy

A ticket notification is enqueued only when all of the following are authoritative and available:

- Ticketing produced a fulfilled reservation and issued ticket;
- the Ticketing inventory has an owning Business and canonical label;
- Destination owner resolves the destination and locale;
- Notifications has exactly one explicitly allowed channel for topic `ticket`.

Missing preference suppresses delivery. Multiple allowed channels are treated as ambiguous and suppressed until a separate multi-channel fan-out contract is introduced.

Failures in Notifications do not roll back or mutate Ticketing/Financial state.

## Provider boundary

No email, SMS, Web Push, APNs, FCM or other provider is activated by this ChangeSet. The current provider-neutral dispatcher remains unchanged.

## PWA boundary

No Service Worker or offline mutation authority changes are introduced.

## Evidence

- pure bridge tests cover explicit consent, suppression, ambiguous channel and missing Destination locale;
- runtime composition test proves the bridge is composed into the Ticketing runtime;
- Ticketing publishes only after verified fulfillment.
