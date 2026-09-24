export const orderingTicketingBridgeSchemaSql = `
ALTER TABLE ordering_orders
  MODIFY source_kind ENUM(
    'business_onboarding',
    'ticketing_reservation',
    'restaurant_reservation'
  ) NOT NULL;
`;

export const orderingTicketingBridgeRollbackSql = `
DELETE FROM ordering_ticketing_reservation_bindings;
DROP TABLE IF EXISTS ordering_restaurant_reservation_bindings;
DELETE FROM ordering_orders
  WHERE source_kind IN ('ticketing_reservation','restaurant_reservation');
ALTER TABLE ordering_orders
  MODIFY source_kind ENUM('business_onboarding') NOT NULL;
`;
