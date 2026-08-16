import type {
  PaymentRepositoryPort,
  VerifiedPaymentResultRepositoryPort,
} from "@touristic/financial";
import type { OrderRepositoryPort } from "@touristic/ordering";
import type { TicketingOrderBindingRepositoryPort } from "@touristic/ordering/ticketing-reservation";

import type { TicketReservationConfirmationAuthorityPort } from "./reservation-application-service.js";

function sameMoney(
  left: { readonly minorUnits: number; readonly currency: string },
  right: { readonly minorUnits: number; readonly currency: string },
): boolean {
  return (
    left.minorUnits === right.minorUnits && left.currency === right.currency
  );
}

export function createOrderingFinancialReservationConfirmationAuthority(dependencies: {
  readonly bindings: TicketingOrderBindingRepositoryPort;
  readonly orders: OrderRepositoryPort;
  readonly payments: PaymentRepositoryPort;
  readonly verifiedResults: VerifiedPaymentResultRepositoryPort;
}): TicketReservationConfirmationAuthorityPort {
  const authority: TicketReservationConfirmationAuthorityPort = {
    async verify(input) {
      const binding = await dependencies.bindings.findByReservationReference(
        input.reservation.id,
      );
      if (!binding || binding.orderId !== input.orderId) return null;

      const expectedProductReference = `${input.reservation.product.kind}:${input.reservation.product.reference}`;
      const expectedMinorUnits =
        input.reservation.unitAmount.minorUnits * input.reservation.quantity;
      if (
        !Number.isSafeInteger(expectedMinorUnits) ||
        expectedMinorUnits <= 0 ||
        binding.productReference !== expectedProductReference ||
        binding.quantity !== input.reservation.quantity ||
        binding.amount.minorUnits !== expectedMinorUnits ||
        binding.amount.currency !== input.reservation.unitAmount.currency ||
        binding.pricingVersion !== input.reservation.pricingVersion
      ) {
        return null;
      }

      const [order, payment, verifiedResult] = await Promise.all([
        dependencies.orders.findById(input.orderId),
        dependencies.payments.findById(input.paymentId),
        dependencies.verifiedResults.findByPaymentStatus(
          input.paymentId,
          "confirmed",
        ),
      ]);
      if (!order || !payment || !verifiedResult) return null;

      if (
        order.id !== binding.orderId ||
        order.status !== "payment_confirmed" ||
        !sameMoney(order.pricing.amount, binding.amount) ||
        order.pricing.pricingVersion !== binding.pricingVersion ||
        payment.id !== input.paymentId ||
        payment.status !== "confirmed" ||
        payment.subject.kind !== "order" ||
        payment.subject.reference !== order.id ||
        !sameMoney(payment.amount, binding.amount) ||
        verifiedResult.paymentId !== payment.id ||
        verifiedResult.orderReference !== order.id ||
        verifiedResult.kind !== "approved" ||
        verifiedResult.paymentStatus !== "confirmed"
      ) {
        return null;
      }

      return Object.freeze({
        orderId: order.id,
        paymentId: payment.id,
      });
    },
  };

  return Object.freeze(authority);
}
