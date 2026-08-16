import { createHash } from "node:crypto";

import { createMoney, normalizeFinancialTimestamp } from "@touristic/financial";
import {
  createTicketingOrderRequestKey,
  type Order,
} from "@touristic/ordering";
import type {
  TicketingCheckoutApplicationRequest,
  ValidatedTicketingCheckoutHandoff,
} from "@touristic/ordering/ticketing-checkout";
import type { TicketingReservationOrderApplicationService } from "@touristic/ordering/ticketing-reservation";
import {
  createTicketQrPayload,
  normalizeTicketId,
  provisionTicketOfflineDeviceCredential,
  type Ticket,
  type TicketOfflineEnvelope,
  type TicketRepositoryPort,
  type TicketSigningSecret,
} from "@touristic/ticketing";
import { renderTicketQrSvg } from "@touristic/ticketing/qr-svg";
import {
  createTicketReservationRequestKey,
  normalizeTicketReservationId,
  type TicketInventoryAvailability,
  type TicketInventoryOffer,
  type TicketReservation,
} from "@touristic/ticketing/reservations";

import type {
  TicketHolderProfile,
  MySqlTicketHolderProfileRepository,
} from "./mysql-ticket-holder-profile-repository.js";
import type { MySqlTicketOfflineDeviceRegistry } from "./mysql-offline-device-registry.js";
import type {
  MySqlTicketReservationRepository,
  TicketReservationHoldResult,
  TicketReservationMutationResult,
} from "./mysql-ticket-reservation-repository.js";
import type { MySqlTicketingPublicReadRepository } from "./mysql-ticketing-public-read-repository.js";
import type { TicketOfflineDeviceSyncService } from "./offline-device-sync.js";
import type { TicketingApplicationService } from "./ticketing-application-service.js";

export const ticketingHttpPrefix = "/api/ticketing/v1";
const HOLD_TTL_MS = 10 * 60 * 1_000;
const MAX_BODY_BYTES = 32 * 1_024;
const IDEMPOTENCY_REFERENCE = /^[A-Za-z0-9_-]{8,120}$/u;
const DEVICE_ID = /^tdv_[A-Za-z0-9_-]{8,116}$/u;

export interface TicketingHttpRequest {
  readonly method: string;
  readonly pathname: string;
  readonly headers?: Readonly<Record<string, unknown>>;
  readonly body?: unknown;
  readonly correlationId?: string;
}

export interface TicketingHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Readonly<Record<string, unknown>>;
}

export interface TicketingHttpActor {
  readonly subject: string;
  readonly role: "admin" | "editor" | "viewer";
}

export type TicketingHttpAuthorizationDecision =
  | { readonly allowed: true; readonly actor: TicketingHttpActor }
  | {
      readonly allowed: false;
      readonly reason:
        | "authentication_required"
        | "read_only_role"
        | "admin_required"
        | "cross_origin_request"
        | "invalid_csrf";
    };

export interface TicketingHttpAuthorizationPort {
  authorize(
    request: TicketingHttpRequest,
    input: { readonly mutation: boolean; readonly admin?: boolean },
  ): Promise<TicketingHttpAuthorizationDecision>;
}

export interface TicketingHttpAuditPort {
  record(event: {
    readonly action: string;
    readonly result: "success" | "denied" | "failure";
    readonly reason: string;
    readonly actorSubject: string | null;
    readonly correlationId: string;
    readonly reservationId: string | null;
  }): Promise<void>;
}

export interface TicketingCheckoutHandoffPort {
  issue(
    handoff: TicketingCheckoutApplicationRequest,
    actor: TicketingHttpActor,
  ): ValidatedTicketingCheckoutHandoff & { readonly token: string } | null;
}

export interface TicketingPublicHttpTransportDependencies {
  readonly enabled: boolean;
  readonly reservations: MySqlTicketReservationRepository;
  readonly reads: MySqlTicketingPublicReadRepository;
  readonly holders: MySqlTicketHolderProfileRepository;
  readonly reservationOrders: TicketingReservationOrderApplicationService;
  readonly checkoutHandoffs: TicketingCheckoutHandoffPort;
  readonly tickets: TicketRepositoryPort;
  readonly ticketing: TicketingApplicationService;
  readonly offlineDevices: TicketOfflineDeviceSyncService;
  readonly offlineDeviceRegistry: MySqlTicketOfflineDeviceRegistry;
  readonly authorization: TicketingHttpAuthorizationPort;
  readonly audit: TicketingHttpAuditPort;
  readonly qrSigningSecret: TicketSigningSecret;
  readonly offlineProvisioningSecret: string;
  readonly clock: { now(): string };
}

function firstHeader(value: unknown): string {
  if (Array.isArray(value)) return firstHeader(value[0]);
  return typeof value === "string" ? value.trim() : "";
}

function header(request: TicketingHttpRequest, name: string): string {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(request.headers ?? {})) {
    if (key.toLowerCase() === target) return firstHeader(value);
  }
  return "";
}

function correlationId(request: TicketingHttpRequest): string {
  const explicit = request.correlationId ?? header(request, "x-correlation-id");
  if (
    typeof explicit === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/u.test(explicit)
  ) {
    return explicit;
  }
  return `tcr_${createHash("sha256")
    .update(`${request.method}:${request.pathname}:${Date.now()}`)
    .digest("hex")
    .slice(0, 24)}`;
}

function response(
  status: number,
  body: Readonly<Record<string, unknown>>,
  correlation: string,
): TicketingHttpResponse {
  return Object.freeze({
    status,
    headers: Object.freeze({
      "Cache-Control": "no-store",
      "X-Correlation-ID": correlation,
    }),
    body: Object.freeze({ ...body }),
  });
}

function authError(
  decision: Extract<TicketingHttpAuthorizationDecision, { allowed: false }>,
  correlation: string,
): TicketingHttpResponse {
  if (decision.reason === "authentication_required") {
    return response(401, { error: "AUTH_REQUIRED" }, correlation);
  }
  if (decision.reason === "invalid_csrf") {
    return response(403, { error: "INVALID_CSRF" }, correlation);
  }
  if (decision.reason === "cross_origin_request") {
    return response(403, { error: "ORIGIN_DENIED" }, correlation);
  }
  if (decision.reason === "admin_required") {
    return response(403, { error: "ADMIN_REQUIRED" }, correlation);
  }
  return response(403, { error: "READ_ONLY_ROLE" }, correlation);
}

function canonicalNow(clock: { now(): string }): string {
  const value = normalizeFinancialTimestamp(clock.now());
  if (!value) throw new Error("TICKETING_CLOCK_INVALID");
  return new Date(value).toISOString();
}

function productReference(inventory: TicketInventoryOffer): string {
  return `${inventory.product.kind}:${inventory.product.reference}`;
}

function reservationId(holderReference: string, requestKey: string): string {
  const digest = createHash("sha256")
    .update(`ticketing-reservation:v1:${holderReference}:${requestKey}`)
    .digest("hex")
    .slice(0, 32);
  const id = normalizeTicketReservationId(`trv_${digest}`);
  if (!id) throw new Error("TICKETING_RESERVATION_ID_INVALID");
  return id;
}

function holdExpiry(inventory: TicketInventoryOffer, heldAt: string): string {
  const heldMs = Date.parse(heldAt);
  const startMs = Date.parse(inventory.startsAt);
  const expiry = Math.min(heldMs + HOLD_TTL_MS, startMs - 1);
  if (!Number.isFinite(expiry) || expiry <= heldMs) {
    throw new Error("TICKETING_RESERVATION_HOLD_WINDOW_INVALID");
  }
  return new Date(expiry).toISOString();
}

function publicInventory(
  inventory: TicketInventoryOffer,
  availability: TicketInventoryAvailability,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    id: inventory.id,
    destinationId: inventory.destinationId,
    product: inventory.product,
    label: inventory.label,
    unitAmount: inventory.unitAmount,
    pricingVersion: inventory.pricingVersion,
    maxPerReservation: inventory.maxPerReservation,
    salesStartAt: inventory.salesStartAt,
    salesEndAt: inventory.salesEndAt,
    startsAt: inventory.startsAt,
    endsAt: inventory.endsAt,
    availableQuantity: availability.remainingQuantity,
  });
}

function publicReservation(
  reservation: TicketReservation,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    id: reservation.id,
    inventoryId: reservation.inventoryId,
    destinationId: reservation.destinationId,
    product: reservation.product,
    unitAmount: reservation.unitAmount,
    pricingVersion: reservation.pricingVersion,
    quantity: reservation.quantity,
    status: reservation.status,
    expiresAt: reservation.expiresAt,
    orderId: reservation.orderId,
    createdAt: reservation.createdAt,
    confirmedAt: reservation.confirmedAt,
    cancelledAt: reservation.cancelledAt,
  });
}

function publicTicket(
  ticket: Ticket,
  qrSigningSecret: TicketSigningSecret,
): Readonly<Record<string, unknown>> {
  const qrPayload = createTicketQrPayload(ticket.id, qrSigningSecret);
  if (!qrPayload) throw new Error("TICKETING_QR_INVALID");
  const qrSvg = renderTicketQrSvg(qrPayload);
  if (!qrSvg) throw new Error("TICKETING_QR_RENDER_INVALID");
  return Object.freeze({
    id: ticket.id,
    orderId: ticket.orderId,
    destinationId: ticket.destinationId,
    product: ticket.product,
    holderName: ticket.holderName,
    quantity: ticket.quantity,
    amount: ticket.amount,
    code: ticket.code,
    status: ticket.status,
    issuedAt: ticket.issuedAt,
    qrSvg,
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function ownReservation(
  reservation: TicketReservation,
  actor: TicketingHttpActor,
): boolean {
  return reservation.holderReference === actor.subject;
}

async function loadOwnReservation(
  dependencies: TicketingPublicHttpTransportDependencies,
  idInput: string,
  actor: TicketingHttpActor,
): Promise<TicketReservation | null> {
  const id = normalizeTicketReservationId(idInput);
  if (!id) return null;
  const reservation = await dependencies.reservations.findReservationById(id);
  return reservation && ownReservation(reservation, actor) ? reservation : null;
}

function checkoutDescriptor(
  reservation: TicketReservation,
  order: Order,
  handoff: ValidatedTicketingCheckoutHandoff & { readonly token: string },
) {
  const idempotencyKey = createTicketingOrderRequestKey(reservation.id);
  if (!idempotencyKey) throw new Error("ORDERING_TICKETING_HANDOFF_INVALID");
  return Object.freeze({
    path: "/api/payments/v1/checkouts",
    idempotencyKey,
    reservationReference: reservation.id,
    orderId: order.id,
    handoffToken: handoff.token,
    handoff: Object.freeze({
      reservationReference: handoff.reservationReference,
      customer: handoff.customer,
      returnUrl: handoff.returnUrl,
      requiresPaymentsCapability: handoff.requiresPaymentsCapability,
    }),
  });
}

function errorStatus(error: unknown): { status: number; code: string } {
  const message = error instanceof Error ? error.message : "";
  if (
    message.includes("INVALID") ||
    message.includes("QUANTITY_LIMIT") ||
    message.includes("HOLD_WINDOW")
  ) {
    return { status: 400, code: message || "INVALID_REQUEST" };
  }
  if (message.includes("EXHAUSTED") || message.includes("CONFLICT")) {
    return { status: 409, code: message };
  }
  if (message.includes("NOT_FOUND")) return { status: 404, code: "NOT_FOUND" };
  if (message.includes("NOT_HELD")) return { status: 409, code: message };
  return { status: 503, code: "TICKETING_UNAVAILABLE" };
}

export class TicketingPublicHttpTransport {
  constructor(private readonly dependencies: TicketingPublicHttpTransportDependencies) {}

  matches(pathname: string): boolean {
    return pathname === ticketingHttpPrefix || pathname.startsWith(`${ticketingHttpPrefix}/`);
  }

  async handle(request: TicketingHttpRequest): Promise<TicketingHttpResponse> {
    const correlation = correlationId(request);
    if (!this.dependencies.enabled) {
      return response(503, { error: "TICKETING_FEATURE_DISABLED" }, correlation);
    }
    const method = request.method.toUpperCase();
    const relative = request.pathname.slice(ticketingHttpPrefix.length);

    if (relative === "/offline-sync" && method === "POST") {
      try {
        const body = record(request.body);
        if (!body) return response(400, { error: "INVALID_REQUEST" }, correlation);
        const result = await this.dependencies.offlineDevices.sync({
          credentialToken: header(request, "authorization").replace(/^Bearer\s+/iu, ""),
          envelope: body.envelope as TicketOfflineEnvelope,
          recordedAt: canonicalNow(this.dependencies.clock),
        });
        await this.dependencies.audit.record({
          action: "ticketing.offline.sync",
          result: "success",
          reason: result.replayed ? "replayed" : "applied",
          actorSubject: null,
          correlationId: correlation,
          reservationId: null,
        });
        return response(200, { data: result }, correlation);
      } catch {
        await this.dependencies.audit.record({
          action: "ticketing.offline.sync",
          result: "denied",
          reason: "device_auth_or_envelope_invalid",
          actorSubject: null,
          correlationId: correlation,
          reservationId: null,
        });
        return response(401, { error: "DEVICE_AUTH_REQUIRED" }, correlation);
      }
    }

    const mutation = method !== "GET";
    const admin = relative.startsWith("/operator/offline-devices");
    const authorization = await this.dependencies.authorization.authorize(request, {
      mutation,
      admin,
    });
    if (!authorization.allowed) return authError(authorization, correlation);
    const actor = authorization.actor;

    try {
      if (relative === "/inventory" && method === "GET") {
        const now = canonicalNow(this.dependencies.clock);
        const inventory = await this.dependencies.reads.listInventory();
        const data = await Promise.all(
          inventory.map(async (offer) =>
            publicInventory(
              offer,
              await this.dependencies.reservations.availability(offer.id, now),
            ),
          ),
        );
        return response(200, { data: Object.freeze(data) }, correlation);
      }

      if (relative === "/reservations" && method === "GET") {
        const reservations = await this.dependencies.reads.listReservationsByHolderReference(
          actor.subject,
        );
        return response(
          200,
          { data: Object.freeze(reservations.map(publicReservation)) },
          correlation,
        );
      }

      if (relative === "/reservations" && method === "POST") {
        const body = record(request.body);
        const inventoryId = typeof body?.inventoryId === "string" ? body.inventoryId : "";
        const quantity = body?.quantity;
        const holderInput = record(body?.holder);
        const returnUrl = typeof body?.returnUrl === "string" ? body.returnUrl : "";
        const reference = header(request, "idempotency-key");
        const now = canonicalNow(this.dependencies.clock);
        if (!IDEMPOTENCY_REFERENCE.test(reference) || !holderInput || !returnUrl) {
          return response(400, { error: "INVALID_RESERVATION_REQUEST" }, correlation);
        }
        const inventory = await this.dependencies.reservations.findInventoryById(inventoryId);
        if (!inventory) return response(404, { error: "INVENTORY_NOT_FOUND" }, correlation);
        const requestKey = createTicketReservationRequestKey(inventory.id, reference);
        if (!requestKey) return response(400, { error: "INVALID_IDEMPOTENCY_KEY" }, correlation);
        const candidate = {
          holderReference: actor.subject,
          holderName: holderInput.name,
          email: holderInput.email,
          phone: holderInput.phone,
          document: holderInput.document,
          createdAt: now,
          updatedAt: now,
        };
        let profile: TicketHolderProfile | null = null;
        try {
          profile = await this.dependencies.holders.save(candidate as TicketHolderProfile);
        } catch {
          profile = null;
        }
        if (!profile) return response(400, { error: "INVALID_HOLDER_PROFILE" }, correlation);
        const held: TicketReservationHoldResult = await this.dependencies.reservations.hold({
          reservationId: reservationId(actor.subject, requestKey),
          requestKey,
          inventoryId: inventory.id,
          holderReference: actor.subject,
          quantity,
          heldAt: now,
          expiresAt: holdExpiry(inventory, now),
          actorReference: actor.subject,
        });
        const totalMinorUnits =
          held.reservation.unitAmount.minorUnits * held.reservation.quantity;
        const amount = createMoney(totalMinorUnits, held.reservation.unitAmount.currency);
        if (!amount || !Number.isSafeInteger(totalMinorUnits)) {
          throw new Error("TICKETING_RESERVATION_AMOUNT_INVALID");
        }
        const orderResult = await this.dependencies.reservationOrders.placeReservationOrder({
          reservationReference: held.reservation.id,
          productReference: productReference(inventory),
          quantity: held.reservation.quantity,
          amount,
          pricingVersion: held.reservation.pricingVersion,
          capturedAt: held.reservation.createdAt,
        });
        const handoff = this.dependencies.checkoutHandoffs.issue(
          {
            reservationReference: held.reservation.id,
            customer: Object.freeze({
              name: profile.holderName,
              email: profile.email,
              phone: profile.phone,
              document: profile.document,
            }),
            returnUrl,
            requiresPaymentsCapability: true,
          },
          actor,
        );
        if (!handoff) throw new Error("ORDERING_TICKETING_HANDOFF_INVALID");
        await this.dependencies.audit.record({
          action: "ticketing.reservation.create",
          result: "success",
          reason: held.replayed || orderResult.replayed ? "replayed" : "created",
          actorSubject: actor.subject,
          correlationId: correlation,
          reservationId: held.reservation.id,
        });
        return response(held.replayed ? 200 : 201, {
          data: Object.freeze({
            reservation: publicReservation(held.reservation),
            availability: held.availability,
            checkout: checkoutDescriptor(
              held.reservation,
              orderResult.order,
              handoff,
            ),
          }),
        }, correlation);
      }

      const reservationMatch = /^\/reservations\/(trv_[A-Za-z0-9_-]+)(?:\/(ticket|cancel))?$/u.exec(relative);
      if (reservationMatch?.[1]) {
        const reservation = await loadOwnReservation(
          this.dependencies,
          reservationMatch[1],
          actor,
        );
        if (!reservation) return response(404, { error: "RESERVATION_NOT_FOUND" }, correlation);
        const action = reservationMatch[2] ?? "read";
        if (action === "read" && method === "GET") {
          return response(200, { data: publicReservation(reservation) }, correlation);
        }
        if (action === "cancel" && method === "POST") {
          const cancelled: TicketReservationMutationResult =
            await this.dependencies.reservations.cancelHold({
              reservationId: reservation.id,
              cancelledAt: canonicalNow(this.dependencies.clock),
              actorReference: actor.subject,
            });
          return response(200, { data: publicReservation(cancelled.reservation) }, correlation);
        }
        if (action === "ticket" && method === "GET") {
          if (!reservation.orderId || reservation.status !== "confirmed") {
            return response(409, { error: "TICKET_NOT_READY" }, correlation);
          }
          const tickets = await this.dependencies.tickets.findByOrderId(reservation.orderId);
          const ticket = tickets.find((entry) => entry.paymentId === reservation.paymentId) ?? null;
          if (!ticket) return response(404, { error: "TICKET_NOT_FOUND" }, correlation);
          return response(200, {
            data: publicTicket(ticket, this.dependencies.qrSigningSecret),
          }, correlation);
        }
      }

      if (relative === "/operator/check-in" && method === "POST") {
        const body = record(request.body);
        if (!body) return response(400, { error: "INVALID_CHECKIN" }, correlation);
        const result = await this.dependencies.ticketing.checkInByQr({
          qrPayload: body.qrPayload,
          operatorReference: actor.subject,
          occurredAt: canonicalNow(this.dependencies.clock),
        });
        return response(200, { data: result }, correlation);
      }

      if (relative === "/operator/offline-devices" && method === "POST") {
        const body = record(request.body);
        const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim() : "";
        const destinationId =
          typeof body?.destinationId === "string" ? body.destinationId.trim() : "";
        const ttlSeconds =
          typeof body?.ttlSeconds === "number" && Number.isSafeInteger(body.ttlSeconds)
            ? body.ttlSeconds
            : 4 * 60 * 60;
        if (!DEVICE_ID.test(deviceId) || ttlSeconds < 300 || ttlSeconds > 24 * 60 * 60) {
          return response(400, { error: "INVALID_DEVICE_REQUEST" }, correlation);
        }
        const issuedAt = canonicalNow(this.dependencies.clock);
        const expiresAt = new Date(Date.parse(issuedAt) + ttlSeconds * 1_000).toISOString();
        const credential = provisionTicketOfflineDeviceCredential(
          { deviceId, destinationId, issuedAt, expiresAt },
          this.dependencies.offlineProvisioningSecret,
        );
        if (!credential) return response(400, { error: "INVALID_DEVICE_REQUEST" }, correlation);
        await this.dependencies.offlineDeviceRegistry.provision({
          deviceId: credential.claims.deviceId,
          destinationId: credential.claims.destinationId,
          credentialFingerprint: createHash("sha256").update(credential.token).digest("hex"),
          issuedAt: credential.claims.issuedAt,
          expiresAt: credential.claims.expiresAt,
          provisionedBy: actor.subject,
          revokedAt: null,
          revokedBy: null,
          lastSyncAt: null,
        });
        await this.dependencies.audit.record({
          action: "ticketing.offline.provision",
          result: "success",
          reason: "scoped_device_credential_issued",
          actorSubject: actor.subject,
          correlationId: correlation,
          reservationId: null,
        });
        return response(201, { data: credential }, correlation);
      }

      const revokeMatch = /^\/operator\/offline-devices\/(tdv_[A-Za-z0-9_-]+)\/revoke$/u.exec(relative);
      if (revokeMatch?.[1] && method === "POST") {
        const revoked = await this.dependencies.offlineDeviceRegistry.revoke(
          revokeMatch[1],
          actor.subject,
          canonicalNow(this.dependencies.clock),
        );
        await this.dependencies.audit.record({
          action: "ticketing.offline.revoke",
          result: "success",
          reason: revoked.revokedAt ? "revoked" : "unchanged",
          actorSubject: actor.subject,
          correlationId: correlation,
          reservationId: null,
        });
        return response(200, {
          data: Object.freeze({
            deviceId: revoked.deviceId,
            destinationId: revoked.destinationId,
            expiresAt: revoked.expiresAt,
            revokedAt: revoked.revokedAt,
          }),
        }, correlation);
      }

      return response(404, { error: "NOT_FOUND" }, correlation);
    } catch (error) {
      const mapped = errorStatus(error);
      await this.dependencies.audit.record({
        action: "ticketing.http",
        result: "failure",
        reason: mapped.code,
        actorSubject: actor.subject,
        correlationId: correlation,
        reservationId: null,
      });
      return response(mapped.status, { error: mapped.code }, correlation);
    }
  }
}

export { MAX_BODY_BYTES };
