import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  createTicketOfflineEnvelope,
  createTicketOfflineEnvelopeSignature,
  normalizeTicketSigningSecret,
  provisionTicketOfflineDeviceCredential,
  type TicketRepositoryPort,
} from "@touristic/ticketing";

import { createTicketOfflineDeviceSyncService } from "./offline-device-sync.js";

const provisioningSecret =
  "ticketing-offline-provisioning-secret-0000000000000001";
const qrSigningSecret = normalizeTicketSigningSecret(
  "ticketing-offline-qr-signing-secret-000000000000001",
);

function harness() {
  if (!qrSigningSecret) throw new Error("FIXTURE_INVALID");
  const credential = provisionTicketOfflineDeviceCredential(
    {
      deviceId: "tdv_offline_sync_0001",
      destinationId: "morro-de-sao-paulo",
      issuedAt: "2026-09-20T10:00:00.000Z",
      expiresAt: "2026-09-20T14:00:00.000Z",
    },
    provisioningSecret,
  );
  if (!credential) throw new Error("FIXTURE_INVALID");
  const ticketId = "tck_offline_sync_0001";
  const tickets = {
    findById: vi.fn().mockResolvedValue({
      id: ticketId,
      destinationId: "morro-de-sao-paulo",
    }),
  } as unknown as TicketRepositoryPort;
  const ticketing = {
    syncOfflineEnvelope: vi.fn().mockResolvedValue({ replayed: false }),
  };
  const devices = {
    findByDeviceId: vi.fn().mockResolvedValue({
      deviceId: credential.claims.deviceId,
      destinationId: credential.claims.destinationId,
      credentialFingerprint: createHash("sha256")
        .update(credential.token)
        .digest("hex"),
      issuedAt: credential.claims.issuedAt,
      expiresAt: credential.claims.expiresAt,
      provisionedBy: "operator_test",
      revokedAt: null,
      revokedBy: null,
      lastSyncAt: null,
    }),
    recordSync: vi.fn().mockResolvedValue(undefined),
  };
  const service = createTicketOfflineDeviceSyncService({
    provisioningSecret,
    qrSigningSecret,
    tickets,
    ticketing: ticketing as never,
    devices: devices as never,
    clock: { now: () => "2026-09-20T11:00:00.000Z" },
  });
  return { service, credential, ticketId, ticketing, devices };
}

function envelopeFor(
  credential: ReturnType<typeof provisionTicketOfflineDeviceCredential>,
  ticketId: string,
  queuedAt: string,
) {
  if (!credential) throw new Error("FIXTURE_INVALID");
  const deviceSecret = normalizeTicketSigningSecret(
    credential.envelopeSigningSecret,
  );
  if (!deviceSecret) throw new Error("FIXTURE_INVALID");
  const payload = `tck.v1.${ticketId}.offline-test-payload`;
  const signature = createTicketOfflineEnvelopeSignature(
    { ticketId, operation: "validate", payload, queuedAt },
    deviceSecret,
  );
  const envelope = createTicketOfflineEnvelope({
    id: `toe_${queuedAt.replace(/[^0-9]/gu, "").slice(0, 16)}_offline`,
    ticketId,
    operation: "validate",
    payload,
    signature,
    queuedAt,
  });
  if (!envelope) throw new Error("FIXTURE_INVALID");
  return envelope;
}

describe("Ticketing offline device sync credential window", () => {
  it(
    "rejects a signed envelope backdated before the device credential was issued",
    async () => {
    const { service, credential, ticketId, ticketing, devices } = harness();
    await expect(
      service.sync({
        credentialToken: credential.token,
        envelope: envelopeFor(
          credential,
          ticketId,
          "2026-09-20T09:59:59.999Z",
        ),
        recordedAt: "2026-09-20T11:00:00.000Z",
      }),
    ).rejects.toThrow("TICKETING_OFFLINE_ENVELOPE_CREDENTIAL_WINDOW_INVALID");
    expect(ticketing.syncOfflineEnvelope).not.toHaveBeenCalled();
    expect(devices.recordSync).not.toHaveBeenCalled();
    },
  );

  it(
    "accepts an envelope queued inside the active device credential window",
    async () => {
    const { service, credential, ticketId, ticketing, devices } = harness();
    await expect(
      service.sync({
        credentialToken: credential.token,
        envelope: envelopeFor(
          credential,
          ticketId,
          "2026-09-20T10:30:00.000Z",
        ),
        recordedAt: "2026-09-20T11:00:00.000Z",
      }),
    ).resolves.toMatchObject({ replayed: false });
    expect(ticketing.syncOfflineEnvelope).toHaveBeenCalledTimes(1);
    expect(devices.recordSync).toHaveBeenCalledWith(
      credential.claims.deviceId,
      "2026-09-20T11:00:00.000Z",
    );
    },
  );
});
