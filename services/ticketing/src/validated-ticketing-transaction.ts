import type { Pool } from "mysql2/promise";

import { normalizeFinancialTimestamp } from "@touristic/financial";
import {
  applyTicketCheckIn,
  createTicket,
  createTicketCheckIn,
  createTicketOfflineEnvelope,
  type Ticket,
  type TicketCheckIn,
  type TicketOfflineEnvelope,
} from "@touristic/ticketing";

import {
  MySqlTicketingTransactionalCommand as RawMySqlTicketingTransactionalCommand,
  type TicketingOfflineTransactionalCommandResult,
  type TicketingTransactionalCommandPort,
  type TicketingTransactionalCommandResult,
} from "./mysql-ticketing-transaction.js";

function sameImmutableAuthority(left: Ticket, right: Ticket): boolean {
  return (
    left.id === right.id &&
    left.orderId === right.orderId &&
    left.paymentId === right.paymentId &&
    left.destinationId === right.destinationId &&
    left.product.kind === right.product.kind &&
    left.product.reference === right.product.reference &&
    left.holderName === right.holderName &&
    left.quantity === right.quantity &&
    left.amount.minorUnits === right.amount.minorUnits &&
    left.amount.currency === right.amount.currency &&
    left.code === right.code &&
    left.issuedAt === right.issuedAt
  );
}

function sameLifecycle(left: Ticket, right: Ticket): boolean {
  return (
    left.status === right.status &&
    left.validatedAt === right.validatedAt &&
    left.usedAt === right.usedAt &&
    left.cancelledAt === right.cancelledAt &&
    left.updatedAt === right.updatedAt
  );
}

function canonicalTransition(input: {
  readonly before: Ticket;
  readonly after: Ticket;
  readonly checkIn: TicketCheckIn;
}): {
  readonly before: Ticket;
  readonly after: Ticket;
  readonly checkIn: TicketCheckIn;
} {
  const before = createTicket(input.before);
  const after = createTicket(input.after);
  const checkIn = createTicketCheckIn(input.checkIn);
  if (!before || !after || !checkIn) {
    throw new Error("TICKETING_TRANSACTION_COMMAND_INVALID");
  }
  if (
    before.id !== after.id ||
    before.id !== checkIn.ticketId ||
    !sameImmutableAuthority(before, after)
  ) {
    throw new Error("TICKETING_TRANSACTION_IDENTITY_MISMATCH");
  }
  const expected = applyTicketCheckIn(before, {
    result: checkIn.result,
    occurredAt: checkIn.occurredAt,
  });
  if (!sameLifecycle(expected, after)) {
    throw new Error("TICKETING_TRANSACTION_TRANSITION_MISMATCH");
  }
  return Object.freeze({ before, after, checkIn });
}

function canonicalOffline(input: {
  readonly before: Ticket;
  readonly after: Ticket;
  readonly checkIn: TicketCheckIn;
  readonly envelope: TicketOfflineEnvelope;
  readonly syncedAt: string;
}) {
  const transition = canonicalTransition(input);
  const envelope = createTicketOfflineEnvelope(input.envelope);
  const syncedAt = normalizeFinancialTimestamp(input.syncedAt);
  if (!envelope || !syncedAt) {
    throw new Error("TICKETING_OFFLINE_TRANSACTION_COMMAND_INVALID");
  }
  const expectedResult =
    envelope.operation === "validate"
      ? "validated"
      : envelope.operation === "use"
        ? "used"
        : "cancelled";
  if (
    transition.checkIn.channel !== "offline_sync" ||
    envelope.ticketId !== transition.before.id ||
    transition.checkIn.result !== expectedResult ||
    transition.checkIn.occurredAt !== envelope.queuedAt ||
    new Date(syncedAt).toISOString() !== transition.checkIn.recordedAt
  ) {
    throw new Error("TICKETING_OFFLINE_TRANSACTION_IDENTITY_MISMATCH");
  }
  return Object.freeze({
    ...transition,
    envelope,
    syncedAt: new Date(syncedAt).toISOString(),
  });
}

export class MySqlTicketingTransactionalCommand implements TicketingTransactionalCommandPort {
  private readonly inner: RawMySqlTicketingTransactionalCommand;

  constructor(pool: Pool) {
    this.inner = new RawMySqlTicketingTransactionalCommand(pool);
  }

  async commitCheckIn(input: {
    readonly before: Ticket;
    readonly after: Ticket;
    readonly checkIn: TicketCheckIn;
  }): Promise<TicketingTransactionalCommandResult> {
    const command = canonicalTransition(input);
    if (command.checkIn.channel !== "online") {
      throw new Error("TICKETING_TRANSACTION_CHANNEL_MISMATCH");
    }
    return this.inner.commitCheckIn(command);
  }

  async commitOfflineSync(input: {
    readonly before: Ticket;
    readonly after: Ticket;
    readonly checkIn: TicketCheckIn;
    readonly envelope: TicketOfflineEnvelope;
    readonly syncedAt: string;
  }): Promise<TicketingOfflineTransactionalCommandResult> {
    return this.inner.commitOfflineSync(canonicalOffline(input));
  }
}
