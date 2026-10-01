export const laneCContracts = Object.freeze([
  Object.freeze({
    interfaceId: "IF-COM-005",
    capability: "Ticket de transporte",
    canonicalOwner: "Ticketing",
    laneOwnership: "COMMERCE_TICKETING",
    classification: "VERSIONED_CONTRACT_REQUIRED",
    requiredContract: "TransportTicketV1",
    reason: "Generic ticket reservations do not prove trip/leg/operator/origin/destination/boarding semantics.",
    ownerApproved: false,
    versionedContractApproved: false,
    runtimeBindingEnabled: false,
    productionAuthorized: false,
  }),
  Object.freeze({
    interfaceId: "IF-COM-006",
    capability: "Reserva de hospedagem",
    canonicalOwner: "Commerce/Lodging owner decision required",
    laneOwnership: "COMMERCE_REVALIDATION_ONLY",
    classification: "NEW_CANONICAL_CAPABILITY_REQUIRED",
    requiredContract: "LodgingReservationV1",
    reason: "No canonical lodging lifecycle equivalent to room/rate-plan/inventory-night/stay/guest semantics exists.",
    ownerApproved: false,
    versionedContractApproved: false,
    runtimeBindingEnabled: false,
    productionAuthorized: false,
  }),
  Object.freeze({
    interfaceId: "IF-BIZ-010",
    capability: "Reservas Business",
    canonicalOwner: "Business presentation over Ticketing/Commerce owner data",
    laneOwnership: "REVALIDATION_ONLY_LANE_B_OWNER",
    classification: "VERSIONED_CONTRACT_REQUIRED",
    requiredContract: "BusinessReservationProjectionV1",
    reason: "Business-scoped reservation projection is not equivalent to inventory/slot management or consumer-holder reads.",
    ownerApproved: false,
    versionedContractApproved: false,
    runtimeBindingEnabled: false,
    productionAuthorized: false,
  }),
  Object.freeze({
    interfaceId: "IF-AFF-002",
    capability: "Self-onboarding do afiliado",
    canonicalOwner: "Affiliates",
    laneOwnership: "AFFILIATES",
    classification: "VERSIONED_CONTRACT_REQUIRED",
    requiredContract: "AffiliateSelfOnboardingV1",
    reason: "Owner primitives exist but no versioned replay-safe browser orchestration contract is approved.",
    ownerApproved: false,
    versionedContractApproved: false,
    runtimeBindingEnabled: false,
    productionAuthorized: false,
  }),
  Object.freeze({
    interfaceId: "IF-AFF-006",
    capability: "Gerador/download de QR de afiliado",
    canonicalOwner: "Affiliates reference authority plus presentation/export",
    laneOwnership: "AFFILIATES",
    classification: "VERSIONED_CONTRACT_REQUIRED",
    requiredContract: "AffiliateReferralQrArtifactV1",
    reason: "Server-issued referral authority exists, while the QR artifact/export contract remains unapproved.",
    ownerApproved: false,
    versionedContractApproved: false,
    runtimeBindingEnabled: false,
    productionAuthorized: false,
  }),
]);

export function laneCContractById(interfaceId) {
  return laneCContracts.find((entry) => entry.interfaceId === interfaceId) ?? null;
}

export function assertLaneCContractRegistry() {
  const expected = new Set(["IF-COM-005", "IF-COM-006", "IF-BIZ-010", "IF-AFF-002", "IF-AFF-006"]);
  if (laneCContracts.length !== expected.size) throw new Error("LANE_C_CONTRACT_COUNT_INVALID");
  const seen = new Set();
  for (const entry of laneCContracts) {
    if (!expected.has(entry.interfaceId) || seen.has(entry.interfaceId)) throw new Error("LANE_C_CONTRACT_SET_INVALID");
    seen.add(entry.interfaceId);
    if (entry.ownerApproved !== false) throw new Error("LANE_C_OWNER_APPROVAL_MUST_REMAIN_FALSE");
    if (entry.versionedContractApproved !== false) throw new Error("LANE_C_VERSIONED_CONTRACT_APPROVAL_MUST_REMAIN_FALSE");
    if (entry.runtimeBindingEnabled !== false || entry.productionAuthorized !== false) throw new Error("LANE_C_RUNTIME_BINDING_MUST_REMAIN_DISABLED");
  }
  return true;
}
