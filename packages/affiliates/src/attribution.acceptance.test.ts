import { describe, expect, it } from "vitest";

import {
  chooseAttribution,
  createAttribution,
  createReferralEvidence,
  isUtcTimestamp,
  normalizeAcquisitionSubjectId,
  normalizeAffiliateId,
  normalizeAffiliateProgramId,
  normalizeAttributionId,
  normalizeReferralEvidenceId,
  type Attribution,
  type ReferralEvidenceSource,
} from "./index.js";

const affiliateId = required(normalizeAffiliateId("aff_acceptance01"));
const programId = required(normalizeAffiliateProgramId("apg_acceptance01"));
const subjectId = required(normalizeAcquisitionSubjectId("asub_acceptance01"));

function required<T>(value: T | null): T {
  if (value === null) throw new Error("TEST_VALUE_REQUIRED");
  return value;
}

function makeAttribution(
  suffix: string,
  source: ReferralEvidenceSource,
  observedAt: string,
  now = observedAt,
): Attribution | null {
  const fingerprint = suffix
    .padEnd(64, "a")
    .slice(0, 64)
    .replace(/[^a-f0-9]/gu, "a");
  const evidence = required(
    createReferralEvidence({
      id: required(
        normalizeReferralEvidenceId(`afev_${suffix.padEnd(8, "0")}`),
      ),
      affiliateId,
      programId,
      subjectId,
      source,
      evidenceFingerprint: fingerprint,
      serverObservedAt: observedAt,
      receivedAt: observedAt,
      validatedByServer: true,
    }),
  );
  return createAttribution(
    required(normalizeAttributionId(`attr_${suffix.padEnd(8, "0")}`)),
    evidence,
    now,
  );
}

describe("AFFILIATE-POLICY-V1 attribution acceptance", () => {
  it("treats the exact 30-day server-clock boundary as expired", () => {
    const evidence = required(
      createReferralEvidence({
        id: required(normalizeReferralEvidenceId("afev_window0001")),
        affiliateId,
        programId,
        subjectId,
        source: "platform_link",
        evidenceFingerprint: "a".repeat(64),
        serverObservedAt: "2026-08-01T00:00:00.000Z",
        receivedAt: "2026-08-01T00:00:00.000Z",
        validatedByServer: true,
      }),
    );

    const inside = createAttribution(
      required(normalizeAttributionId("attr_window0001")),
      evidence,
      "2026-08-30T23:59:59.999Z",
    );
    expect(inside?.expiresAt).toBe("2026-08-31T00:00:00.000Z");

    expect(
      createAttribution(
        required(normalizeAttributionId("attr_window0002")),
        evidence,
        "2026-08-31T00:00:00.000Z",
      ),
    ).toBeNull();
    expect(
      createAttribution(
        required(normalizeAttributionId("attr_window0003")),
        evidence,
        "2026-08-31T00:00:00.001Z",
      ),
    ).toBeNull();
  });

  it("accepts UTC server time only and rejects offset/client timestamp forms", () => {
    expect(isUtcTimestamp("2026-08-17T12:00:00Z")).toBe(true);
    expect(isUtcTimestamp("2026-08-17T12:00:00.000Z")).toBe(true);
    expect(isUtcTimestamp("2026-08-17T09:00:00-03:00")).toBe(false);
    expect(isUtcTimestamp("2026-08-17 12:00:00Z")).toBe(false);
  });

  it("selects precedence deterministically in normal and reverse arrival order", () => {
    const link = required(
      makeAttribution("link0001", "platform_link", "2026-08-17T10:00:00.000Z"),
    );
    const server = required(
      makeAttribution(
        "serv0001",
        "server_referral",
        "2026-08-17T10:00:01.000Z",
      ),
    );
    const checkout = required(
      makeAttribution("code0001", "checkout_code", "2026-08-17T10:00:02.000Z"),
    );

    expect(
      chooseAttribution(link, server, "open", "2026-08-17T10:00:03.000Z"),
    ).toBe(server);
    expect(
      chooseAttribution(server, checkout, "open", "2026-08-17T10:00:03.000Z"),
    ).toBe(checkout);
    expect(
      chooseAttribution(checkout, server, "open", "2026-08-17T10:00:03.000Z"),
    ).toBe(checkout);
    expect(
      chooseAttribution(checkout, link, "open", "2026-08-17T10:00:03.000Z"),
    ).toBe(checkout);
  });

  it("uses latest server-observed evidence inside the same precedence tier", () => {
    const older = required(
      makeAttribution("same0001", "platform_link", "2026-08-17T10:00:00.000Z"),
    );
    const newer = required(
      makeAttribution("same0002", "platform_qr", "2026-08-17T10:00:00.001Z"),
    );
    expect(
      chooseAttribution(older, newer, "open", "2026-08-17T10:00:01.000Z"),
    ).toBe(newer);
    expect(
      chooseAttribution(newer, older, "open", "2026-08-17T10:00:01.000Z"),
    ).toBe(newer);
  });

  it("never overwrites an attribution after the order lock", () => {
    const link = required(
      makeAttribution("lock0001", "platform_link", "2026-08-17T10:00:00.000Z"),
    );
    const checkout = required(
      makeAttribution("lock0002", "checkout_code", "2026-08-17T10:00:01.000Z"),
    );
    expect(
      chooseAttribution(link, checkout, "locked", "2026-08-17T10:00:02.000Z"),
    ).toBe(link);
  });
});
