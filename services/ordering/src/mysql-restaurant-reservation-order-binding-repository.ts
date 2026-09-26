import type { Pool, RowDataPacket } from "mysql2/promise";

import {
  createRestaurantReservationOrderBinding,
  normalizeRestaurantReservationReference,
  restaurantReservationOrderBindingsEqual,
  type RestaurantReservationOrderBinding,
  type RestaurantReservationOrderBindingRepositoryPort,
} from "@touristic/ordering/restaurant-reservation";
import { normalizeOrderId, type OrderId } from "@touristic/ordering";

interface RestaurantOrderBindingRow extends RowDataPacket {
  reservation_reference: string;
  order_id: string;
  business_id: string;
  amount_minor: number | string;
  currency: string;
  pricing_version: string;
  bound_at: Date | string;
}

function timestamp(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("ORDERING_RESTAURANT_INVALID_DB_TIMESTAMP");
  }
  return parsed.toISOString();
}

function fromRow(
  row: RestaurantOrderBindingRow,
): RestaurantReservationOrderBinding {
  const binding = createRestaurantReservationOrderBinding({
    reservationReference: row.reservation_reference,
    orderId: row.order_id,
    businessId: row.business_id,
    amount: {
      minorUnits: Number(row.amount_minor),
      currency: row.currency,
    },
    pricingVersion: row.pricing_version,
    boundAt: timestamp(row.bound_at),
  });
  if (!binding) {
    throw new Error("ORDERING_RESTAURANT_INVALID_PERSISTED_BINDING");
  }
  return binding;
}

const columns = `
  reservation_reference,
  order_id,
  business_id,
  amount_minor,
  currency,
  pricing_version,
  bound_at
`;

export class MySqlRestaurantReservationOrderBindingRepository implements RestaurantReservationOrderBindingRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async findByReservationReference(
    reservationReferenceInput: string,
  ): Promise<RestaurantReservationOrderBinding | null> {
    const reservationReference = normalizeRestaurantReservationReference(
      reservationReferenceInput,
    );
    if (!reservationReference) {
      throw new Error("ORDERING_RESTAURANT_INVALID_RESERVATION_REFERENCE");
    }
    const [rows] = await this.pool.execute<RestaurantOrderBindingRow[]>(
      `SELECT ${columns}
       FROM ordering_restaurant_reservation_bindings
       WHERE reservation_reference = ?
       LIMIT 1`,
      [reservationReference],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async findByOrderId(
    orderIdInput: OrderId,
  ): Promise<RestaurantReservationOrderBinding | null> {
    const orderId = normalizeOrderId(orderIdInput);
    if (!orderId) throw new Error("ORDERING_RESTAURANT_INVALID_ORDER_ID");
    const [rows] = await this.pool.execute<RestaurantOrderBindingRow[]>(
      `SELECT ${columns}
       FROM ordering_restaurant_reservation_bindings
       WHERE order_id = ?
       LIMIT 1`,
      [orderId],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async save(
    bindingInput: RestaurantReservationOrderBinding,
  ): Promise<RestaurantReservationOrderBinding> {
    const binding = createRestaurantReservationOrderBinding(bindingInput);
    if (!binding) {
      throw new Error("ORDERING_RESTAURANT_INVALID_BINDING");
    }

    await this.pool.execute(
      `INSERT IGNORE INTO ordering_restaurant_reservation_bindings (
        reservation_reference, order_id, business_id, amount_minor,
        currency, pricing_version, bound_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        binding.reservationReference,
        binding.orderId,
        binding.businessId,
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
      const conflict = await this.findByOrderId(binding.orderId);
      if (conflict) {
        throw new Error("ORDERING_RESTAURANT_ORDER_BINDING_CONFLICT");
      }
      throw new Error("ORDERING_RESTAURANT_BINDING_NOT_PERSISTED");
    }
    if (!restaurantReservationOrderBindingsEqual(persisted, binding)) {
      throw new Error("ORDERING_RESTAURANT_IMMUTABLE_BINDING_CONFLICT");
    }
    return persisted;
  }
}
