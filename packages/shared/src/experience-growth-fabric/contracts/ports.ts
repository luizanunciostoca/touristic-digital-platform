export type PortResult<T> =
  | Readonly<{ status: "available"; value: T }>
  | Readonly<{ status: "unavailable"; code: string }>;

export interface GrowthRequestContext {
  readonly destinationId: string;
  readonly tenantId?: string;
  readonly subjectId?: string;
  readonly userId?: string;
  readonly locale: string;
  readonly timezone: string;
  readonly currency: string;
  readonly correlationId: string;
}

export interface IdentitySnapshot {
  readonly userId: string;
  readonly verified: boolean;
}

export interface DestinationContextSnapshot {
  readonly destinationId: string;
  readonly timezone: string;
  readonly currency: string;
}

export interface AffiliateEligibilitySnapshot {
  readonly active: boolean;
  readonly programReference: string;
  readonly policyVersion: string;
}

export interface TimedSignal {
  readonly code: string;
  readonly occurredAt: string;
}

export interface SearchCandidate {
  readonly reference: string;
  readonly kind: string;
  readonly score: number;
}

export interface ExperienceProof {
  readonly verified: boolean;
  readonly trustCode: string;
  readonly proofDigest?: string;
}

export interface NavigationSignal {
  readonly placeReference: string;
  readonly occurredAt: string;
}

export interface CatalogCandidate {
  readonly reference: string;
  readonly active: boolean;
  readonly category: string;
}

export interface MarketplaceIntent {
  readonly highIntent: boolean;
  readonly references: readonly string[];
}

export interface BookingEvidence {
  readonly consumed: boolean;
  readonly occurredAt?: string;
  readonly evidenceDigest?: string;
}

export interface OrderEvidence {
  readonly state: string;
  readonly paymentReference?: string;
  readonly contractVersion: number;
}

export interface GrowthEconomicsInput {
  readonly platformNetRevenueMinorUnits: number;
  readonly affiliateCommissionMinorUnits: number;
  readonly platformRewardCostMinorUnits: number;
  readonly paymentCostMinorUnits: number;
  readonly refundCostMinorUnits: number;
  readonly promotionalSubsidyMinorUnits: number;
  readonly currency: string;
  readonly evidenceDigest: string;
}

export interface CheckInEvidence {
  readonly checkedIn: boolean;
  readonly checkedInAt?: string;
  readonly evidenceDigest?: string;
}

export interface RewardSponsorship {
  readonly active: boolean;
  readonly fundingClass: "merchant-funded" | "access-based";
}

export interface NotificationRequestResult {
  readonly accepted: boolean;
  readonly reference: string;
}

export interface GrowthAuthorizationDecision {
  readonly allowed: boolean;
  readonly decisionReference: string;
}

export interface IdentityPort {
  resolveIdentityLink(
    subjectId: string,
    context: GrowthRequestContext,
  ): Promise<PortResult<IdentitySnapshot>>;
}

export interface DestinationPort {
  getDestinationContext(
    destinationId: string,
  ): Promise<PortResult<DestinationContextSnapshot>>;
}

export interface AffiliatePort {
  getAffiliateEligibility(
    affiliateReference: string,
    context: GrowthRequestContext,
  ): Promise<PortResult<AffiliateEligibilitySnapshot>>;
}

export interface AssistantPort {
  getAssistantSignals(
    context: GrowthRequestContext,
  ): Promise<PortResult<ReadonlyArray<TimedSignal>>>;
}

export interface SearchPort {
  searchCandidates(
    query: string,
    context: GrowthRequestContext,
  ): Promise<PortResult<ReadonlyArray<SearchCandidate>>>;
}

export interface GeospatialPort {
  verifyPlaceExperience(
    placeReference: string,
    proofReference: string,
    context: GrowthRequestContext,
  ): Promise<PortResult<ExperienceProof>>;
}

export interface NavigationPort {
  getNavigationSignals(
    context: GrowthRequestContext,
  ): Promise<PortResult<ReadonlyArray<NavigationSignal>>>;
}

export interface CatalogPort {
  getCatalogCandidate(
    reference: string,
    context: GrowthRequestContext,
  ): Promise<PortResult<CatalogCandidate>>;
}

export interface MarketplacePort {
  getMarketplaceIntent(
    context: GrowthRequestContext,
  ): Promise<PortResult<MarketplaceIntent>>;
}

export interface BookingPort {
  getBookingEvidence(
    bookingReference: string,
    context: GrowthRequestContext,
  ): Promise<PortResult<BookingEvidence>>;
}

export interface OrderingPort {
  getOrderEvidence(
    orderReference: string,
    context: GrowthRequestContext,
  ): Promise<PortResult<OrderEvidence>>;
}

export interface FinancialEvidencePort {
  getGrowthEconomicsInput(
    commerceReference: string,
    context: GrowthRequestContext,
  ): Promise<PortResult<GrowthEconomicsInput>>;
}

export interface TicketingPort {
  getCheckInEvidence(
    ticketReference: string,
    context: GrowthRequestContext,
  ): Promise<PortResult<CheckInEvidence>>;
}

export interface BusinessPort {
  getRewardSponsorship(
    sponsorReference: string,
    context: GrowthRequestContext,
  ): Promise<PortResult<RewardSponsorship>>;
}

export interface NotificationsPort {
  requestNotification(
    input: Readonly<{
      subjectId: string;
      rationaleCode: string;
      expiresAt: string;
      correlationId: string;
    }>,
  ): Promise<PortResult<NotificationRequestResult>>;
}

export interface AnalyticsPort {
  recordTelemetry(
    name: string,
    dimensions: Readonly<Record<string, string | number | boolean>>,
    context: GrowthRequestContext,
  ): Promise<void>;
}

export type CrmLifecycleSignal =
  | "HighIntentTraveler"
  | "CustomerCreated"
  | "RepeatCustomer"
  | "BookingStarted";

export interface CrmLifecyclePort {
  recordLifecycleSignal(
    signal: CrmLifecycleSignal,
    context: GrowthRequestContext,
  ): Promise<void>;
}

export interface ControlCenterAuthorizationPort {
  authorizeGrowthOperation(
    capability: string,
    context: GrowthRequestContext,
  ): Promise<PortResult<GrowthAuthorizationDecision>>;
}
