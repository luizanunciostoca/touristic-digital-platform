import {
  createPricingQuote,
  type OrderPricingAuthorityPort,
  type PricingQuote,
} from "@touristic/ordering";

export interface OrderingPricingEnvironment {
  readonly ORDERING_PRICING_CATALOG_JSON?: string;
}

interface PricingCatalogRecord {
  readonly version?: unknown;
  readonly plans?: unknown;
}

function pricingRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function invalidCatalog(): never {
  throw new Error("ORDERING_PRICING_CATALOG_INVALID");
}

export function createOrderPricingAuthorityFromEnvironment(
  environment: OrderingPricingEnvironment,
): OrderPricingAuthorityPort {
  const source = environment.ORDERING_PRICING_CATALOG_JSON?.trim();
  if (!source) {
    throw new Error("ORDERING_PRICING_CATALOG_JSON is required");
  }
  if (source.length > 262_144) invalidCatalog();

  let parsed: PricingCatalogRecord;
  try {
    parsed = JSON.parse(source) as PricingCatalogRecord;
  } catch {
    invalidCatalog();
  }

  const catalog = pricingRecord(parsed);
  if (
    !catalog ||
    !Array.isArray(catalog.plans) ||
    catalog.plans.length === 0 ||
    catalog.plans.length > 100
  ) {
    invalidCatalog();
  }

  const quotes = new Map<string, PricingQuote>();
  for (const rawPlan of catalog.plans) {
    const plan = pricingRecord(rawPlan);
    if (!plan) invalidCatalog();
    const quote = createPricingQuote({
      planId: plan.id,
      planName: plan.name,
      minorUnits: plan.minorUnits,
      currency: plan.currency,
      pricingVersion: catalog.version,
    });
    if (
      !quote ||
      quote.amount.minorUnits <= 0 ||
      plan.id !== quote.planId ||
      plan.name !== quote.planName ||
      catalog.version !== quote.pricingVersion ||
      quotes.has(quote.planId)
    ) {
      invalidCatalog();
    }
    quotes.set(quote.planId, quote);
  }

  return Object.freeze({
    async resolvePlan(planId: string): Promise<PricingQuote | null> {
      if (typeof planId !== "string" || planId.trim() !== planId) return null;
      return quotes.get(planId) ?? null;
    },
  });
}
