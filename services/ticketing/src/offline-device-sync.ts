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

import type { TicketingApplicationService } from "./ticketing-application-service.js";

export interface TicketOfflineDeviceSyncService {
  sync(input: {
    readonly credentialToken: unknown;
    readonly envelope: TicketOfflineEnvelope;
    readonly recordedAt: unknown;
  }): Promise<TicketOfflineSyncResult>;
}

export function createTicketOfflineDeviceSyncService(dependencies: {
  readonly provisioningSecret: string;
  readonly qrSigningSecret: TicketSigningSecret;
  readonly tickets: TicketRepositoryPort;
  readonly ticketing: TicketingApplicationService;
  readonly clock: { now(): string };
}): TicketOfflineDeviceSyncService {
  const qrSigningSecret = normalizeTicketSigningSecret(
    dependencies.qrSigningSecret,
  );
  if (!qrSigningSecret) throw new Error("TICKETING_SIGNING_SECRET_INVALID");

  return Object.freeze({
    async sync(input) {
      const now = dependencies.clock.now();
      const credential = verifyTicketOfflineDeviceCredential(
        input.credentialToken,
        dependencies.provisioningSecret,
        now,
      );
      if (!credential) throw new Error("TICKETING_DEVICE_CREDENTIAL_INVALID");
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
      return dependencies.ticketing.syncOfflineEnvelope({
        envelope: Object.freeze({ ...envelope, signature: translatedSignature }),
        operatorReference: credential.claims.deviceId,
        recordedAt: input.recordedAt,
      });
    },
  });
}
