# @touristic/commerce — Commerce Core

This package is the canonical orchestration contract for Morro Commerce. It does not own checkout, prices, orders, payments, tickets, QR, wallet, fulfillment, inventory persistence, or financial state.

## Commerce modes

The canonical modes are:

- `ticketed_admission`
- `activity_reservation`
- `table_reservation`
- `transport_ticket`

## Canonical identity

`CommerceOfferingIdentity` carries explicit stable identifiers for offering, destination, business, place, and inventory. Offering and destination are mandatory. Business, place, and inventory may be null when the domain does not provide them.

Names, labels, slugs, and product references are presentation or compatibility data only. They are never promoted into a canonical offering, business, or place identifier.

## Ticketing / Inventory compatibility

`readTicketingInventoryContract` is a read-only structural adapter for the current Ticketing inventory contract. It reads only inventory ID, destination ID, product reference, and label.

`adaptTicketingInventoryOffer` creates a Commerce offering only when a separate explicit canonical binding is supplied. The binding destination must exactly match the Ticketing inventory destination. The adapter never derives primary identity from a name, label, slug, product reference, price, order, payment, ticket, QR, or wallet field.

## Authority boundary

Commerce Core is orchestration-only in this wave:

- Ticketing remains authoritative for ticket inventory and ticket lifecycle.
- Inventory remains authoritative for capacity and availability.
- Ordering remains authoritative for orders and checkout handoff.
- Payments / Financial remain authoritative for money and verified payment outcomes.
- QR / Wallet remain authoritative in their existing domains.
- No persistent Commerce schema or migration is introduced here.

Future integration waves should depend on these contracts while preserving the existing domain authorities above.
