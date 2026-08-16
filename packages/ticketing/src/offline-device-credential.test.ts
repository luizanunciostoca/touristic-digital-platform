import { describe, expect, it } from "vitest";

import {
  provisionTicketOfflineDeviceCredential,
  verifyTicketOfflineDeviceCredential,
} from "./offline-device-credential.js";

const master = "ticketing-offline-device-master-secret-00000001";

describe("Ticketing offline device credential", () => {
  it("provisions a scoped short-lived credential without exposing the master secret", () => {
    const credential = provisionTicketOfflineDeviceCredential(
      {
        deviceId: "tdv_gate_device_0001",
        destinationId: "morro-de-sao-paulo",
        issuedAt: "2026-08-16T18:00:00.000Z",
        expiresAt: "2026-08-16T22:00:00.000Z",
      },
      master,
    );
    expect(credential).not.toBeNull();
    expect(credential?.token).toMatch(/^tdc\.v1\./u);
    expect(credential?.token).not.toContain(master);
    expect(credential?.envelopeSigningSecret).toHaveLength(64);
    expect(credential?.claims).toMatchObject({
      deviceId: "tdv_gate_device_0001",
      destinationId: "morro-de-sao-paulo",
    });
  });

  it("verifies the same scoped envelope key and rejects expiry/tampering", () => {
    const credential = provisionTicketOfflineDeviceCredential(
      {
        deviceId: "tdv_gate_device_0002",
        destinationId: "morro-de-sao-paulo",
        issuedAt: "2026-08-16T18:00:00.000Z",
        expiresAt: "2026-08-16T22:00:00.000Z",
      },
      master,
    );
    if (!credential) throw new Error("FIXTURE_INVALID");

    expect(
      verifyTicketOfflineDeviceCredential(
        credential.token,
        master,
        "2026-08-16T20:00:00.000Z",
      )?.envelopeSigningSecret,
    ).toBe(credential.envelopeSigningSecret);
    expect(
      verifyTicketOfflineDeviceCredential(
        credential.token,
        master,
        "2026-08-16T22:00:00.000Z",
      ),
    ).toBeNull();
    expect(
      verifyTicketOfflineDeviceCredential(
        `${credential.token.slice(0, -1)}0`,
        master,
        "2026-08-16T20:00:00.000Z",
      ),
    ).toBeNull();
  });

  it("caps credentials at 24 hours", () => {
    expect(
      provisionTicketOfflineDeviceCredential(
        {
          deviceId: "tdv_gate_device_0003",
          destinationId: "morro-de-sao-paulo",
          issuedAt: "2026-08-16T18:00:00.000Z",
          expiresAt: "2026-08-17T18:00:01.000Z",
        },
        master,
      ),
    ).toBeNull();
  });
});
