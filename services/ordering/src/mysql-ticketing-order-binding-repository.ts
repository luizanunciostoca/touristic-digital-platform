import type { Pool, RowDataPacket } from "mysql2/promise";

import {
  createTicketingOrderBinding,
  normalizeTicketingReservationReference,
  ticketingOrderBindingsEqual,
  type TicketingOrderBinding,
  type TicketingOrderBindingRepositoryPort,
} from "@touristic/ordering/ticketing-reservation";
import { normalizeOrderId, type OrderId } from "@touristic/ordering";

interface TicketingOrderBindingRow extends RowDataPacket {
  reservation_reference: string;
  order_id: string;
  product_reference: string;
  quantity: number | string;
  amount_minor: number | string;
  currency: string;
  pricing_version: string;
  bound_at: Date | string;
}

function timestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("ORDERING_TICKETING_INVALID_DB_TIMESTAMP");
  }
  return date.toISOString();
}

function fromRow(row: TicketingOrderBindingRow): TicketingOrderBinding {
  const binding = createTicketingOrderBinding({
    reservationReference: row.reservation_reference,
    orderId: row.order_id,
    productReference: row.product_reference,
    quantity: Number(row.quantity),
    amount: {
      minorUnits: Number(row.amount_minor),
      currency: row.currency,
    },
    pricingVersion: row.pricing_version,
    boundAt: timestamp(row.bound_at),
  });
  if (!binding) throw new Error("ORDERING_TICKETING_INVALID_PERSISTED_BINDING");
  return binding;
}

const COLUMNS = `
  reservation_reference,
  order_id,
  product_reference,
  quantity,
  amount_minor,
  currency,
  pricing_version,
  bound_at
`;

export class MySqlTicketingOrderBindingRepository implements TicketingOrderBindingRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async findByReservationReference(
    reservationReferenceInput: string,
  ): Promise<TicketingOrderBinding | null> {
    const reservationReference = normalizeTicketingReservationReference(
      reservationReferenceInput,
    );
    if (!reservationReference) {
      throw new Error("ORDERING_TICKETING_INVALID_RESERVATION_REFERENCE");
    }
    const [rows] = await this.pool.execute<TicketingOrderBindingRow[]>(
      `SELECT ${COLUMNS} FROM ordering_ticketing_reservation_bindings WHERE reservation_reference = ? LIMIT 1`,
      [reservationReference],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async findByOrderId(
    orderIdInput: OrderId,
  ): Promise<TicketingOrderBinding | null> {
    const orderId = normalizeOrderId(orderIdInput);
    if (!orderId) throw new Error("ORDERING_TICKETING_INVALID_ORDER_ID");
    const [rows] = await this.pool.execute<TicketingOrderBindingRow[]>(
      `SELECT ${COLUMNS} FROM ordering_ticketing_reservation_bindings WHERE order_id = ? LIMIT 1`,
      [orderId],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async save(
    bindingInput: TicketingOrderBinding,
  ): Promise<TicketingOrderBinding> {
    const binding = createTicketingOrderBinding(bindingInput);
    if (!binding) throw new Error("ORDERING_TICKETING_INVALID_BINDING");

    await this.pool.execute(
      `INSERT IGNORE INTO ordering_ticketing_reservation_bindings (
        reservation_reference, order_id, product_reference, quantity,
        amount_minor, currency, pricing_version, bound_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        binding.reservationReference,
        binding.orderId,
        binding.productReference,
        binding.quantity,
        binding.amount.minorUnits,
        binding.amount.currency,
        binding.pricingVersion,
        new Date(binding.boundAt),
      ],
    );

    const persisted = await this.findByReservationReference(
      binding.reservationReference,
    );
    if (!persisted) {
      const conflictingOrder = await this.findByOrderId(binding.orderId);
      if (conflictingOrder) {
        throw new Error("ORDERING_TICKETING_ORDER_BINDING_CONFLICT");
      }
      throw new Error("ORDERING_TICKETING_BINDING_NOT_PERSISTED");
    }
    if (!ticketingOrderBindingsEqual(persisted, binding)) {
      throw new Error("ORDERING_TICKETING_IMMUTABLE_BINDING_CONFLICT");
    }
    return persisted;
  }
}
