export const orderingTicketingBridgeSchemaSql = `
ALTER TABLE ordering_orders
  MODIFY source_kind ENUM('business_onboarding','ticketing_reservation','restaurant_reservation') NOT NULL;
`;

export const orderingTicketingBridgeRollbackSql = `
DELETE FROM ordering_ticketing_reservation_bindings;
DELETE FROM ordering_orders WHERE source_kind = 'ticketing_reservation';
ALTER TABLE ordering_orders
  MODIFY source_kind ENUM('business_onboarding','restaurant_reservation') NOT NULL;
`;
