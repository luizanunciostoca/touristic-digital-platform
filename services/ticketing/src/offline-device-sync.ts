import { createHash, timingSafeEqual } from "node:crypto";

import {
  createTicketOfflineEnvelopeSignature,
  normalizeTicketSigningSecret,
  verifyTicketOfflineDeviceCredential,
  verifyTicketOfflineEnvelope,
  type TicketOfflineEnvelope,
  type TicketOfflineSyncResult,
  type TicketRepositoryPort,
  type TicketSigningSecret,
} from "@touristic/ticketing";

import type { MySqlTicketOfflineDeviceRegistry } from "./mysql-offline-device-registry.js";
import type { TicketingApplicationService } from "./ticketing-application-service.js";

export interface TicketOfflineDeviceSyncInput {
  readonly credentialToken: unknown;
  readonly envelope: TicketOfflineEnvelope;
  readonly recordedAt: unknown;
}

export interface TicketOfflineDeviceSyncService {
  sync(input: TicketOfflineDeviceSyncInput): Promise<TicketOfflineSyncResult>;
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function createTicketOfflineDeviceSyncService(dependencies: {
  readonly provisioningSecret: string;
  readonly qrSigningSecret: TicketSigningSecret;
  readonly tickets: TicketRepositoryPort;
  readonly ticketing: TicketingApplicationService;
  readonly devices: MySqlTicketOfflineDeviceRegistry;
  readonly clock: { now(): string };
}): TicketOfflineDeviceSyncService {
  const qrSigningSecret = normalizeTicketSigningSecret(
    dependencies.qrSigningSecret,
  );
  if (!qrSigningSecret) throw new Error("TICKETING_SIGNING_SECRET_INVALID");

  return Object.freeze({
    async sync(input: TicketOfflineDeviceSyncInput) {
      const now = dependencies.clock.now();
      const credential = verifyTicketOfflineDeviceCredential(
        input.credentialToken,
        dependencies.provisioningSecret,
        now,
      );
      if (!credential) throw new Error("TICKETING_DEVICE_CREDENTIAL_INVALID");
      const registration = await dependencies.devices.findByDeviceId(
        credential.claims.deviceId,
      );
      const observedFingerprint = fingerprint(credential.token);
      if (
        !registration ||
        registration.revokedAt !== null ||
        registration.destinationId !== credential.claims.destinationId ||
        registration.issuedAt !== credential.claims.issuedAt ||
        registration.expiresAt !== credential.claims.expiresAt ||
        Date.parse(now) >= Date.parse(registration.expiresAt) ||
        !secureEqual(
          observedFingerprint,
          registration.credentialFingerprint,
        )
      ) {
        throw new Error("TICKETING_DEVICE_CREDENTIAL_REVOKED_OR_UNKNOWN");
      }

      const deviceSecret = normalizeTicketSigningSecret(
        credential.envelopeSigningSecret,
      );
      if (!deviceSecret) throw new Error("TICKETING_DEVICE_CREDENTIAL_INVALID");
      const envelope = verifyTicketOfflineEnvelope(input.envelope, deviceSecret);
      if (!envelope) throw new Error("TICKETING_OFFLINE_ENVELOPE_INVALID");
      const ticket = await dependencies.tickets.findById(envelope.ticketId);
      if (!ticket || ticket.destinationId !== credential.claims.destinationId) {
        throw new Error("TICKETING_DEVICE_DESTINATION_MISMATCH");
      }

      const translatedSignature = createTicketOfflineEnvelopeSignature(
        {
          ticketId: envelope.ticketId,
          operation: envelope.operation,
          payload: envelope.payload,
          queuedAt: envelope.queuedAt,
        },
        qrSigningSecret,
      );
      if (!translatedSignature) {
        throw new Error("TICKETING_OFFLINE_ENVELOPE_INVALID");
      }
      const result = await dependencies.ticketing.syncOfflineEnvelope({
        envelope: Object.freeze({ ...envelope, signature: translatedSignature }),
        operatorReference: credential.claims.deviceId,
        recordedAt: input.recordedAt,
      });
      await dependencies.devices.recordSync(
        credential.claims.deviceId,
        String(input.recordedAt),
      );
      return result;
    },
  });
}
