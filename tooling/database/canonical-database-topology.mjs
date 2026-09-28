const domains = [
  {
    domain: "AUTH",
    id: "auth",
    environmentKey: "AUTH_DATABASE_URL",
    schema: "morro_auth",
    ownerUser: "morro_auth",
    scope: "platform",
  },
  {
    domain: "AUDIT",
    id: "audit",
    environmentKey: "CONTROL_CENTER_AUDIT_DATABASE_URL",
    schema: "morro_audit",
    ownerUser: "morro_audit",
    scope: "mixed",
  },
  {
    domain: "DESTINATIONS",
    id: "destinations",
    environmentKey: "DESTINATIONS_DATABASE_URL",
    schema: "morro_destinations",
    ownerUser: "morro_destinations",
    scope: "destination-registry",
  },
  {
    domain: "CONTENT",
    id: "content",
    environmentKey: "CONTENT_DATABASE_URL",
    schema: "morro_content",
    ownerUser: "morro_content",
    scope: "destination-aware",
  },
  {
    domain: "BUSINESS",
    id: "business",
    environmentKey: "BUSINESS_DATABASE_URL",
    schema: "morro_business",
    ownerUser: "morro_business",
    scope: "destination-aware",
  },
  {
    domain: "CRM",
    id: "crm",
    environmentKey: "CRM_DATABASE_URL",
    schema: "morro_crm",
    ownerUser: "morro_crm",
    scope: "destination-aware",
  },
  {
    domain: "AFFILIATES",
    id: "affiliates",
    environmentKey: "AFFILIATES_DATABASE_URL",
    schema: "morro_affiliates",
    ownerUser: "morro_affiliates",
    scope: "destination-aware",
  },
  {
    domain: "COMMERCE",
    id: "commerce",
    environmentKey: "COMMERCE_DATABASE_URL",
    schema: "morro_commerce",
    ownerUser: "morro_commerce",
    scope: "destination-aware",
  },
  {
    domain: "ORDERING",
    id: "ordering",
    environmentKey: "ORDERING_DATABASE_URL",
    schema: "morro_ordering",
    ownerUser: "morro_ordering",
    scope: "destination-aware",
  },
  {
    domain: "FINANCIAL",
    id: "financial",
    environmentKey: "FINANCIAL_DATABASE_URL",
    schema: "morro_financial",
    ownerUser: "morro_financial",
    scope: "destination-aware",
  },
  {
    domain: "TICKETING",
    id: "ticketing",
    environmentKey: "TICKETING_DATABASE_URL",
    schema: "morro_ticketing",
    ownerUser: "morro_ticketing",
    scope: "destination-aware",
  },
  {
    domain: "NOTIFICATIONS",
    id: "notifications",
    environmentKey: "NOTIFICATIONS_DATABASE_URL",
    schema: "morro_notifications",
    ownerUser: "morro_notifications",
    scope: "destination-aware",
  },
  {
    domain: "ANALYTICS",
    id: "analytics",
    environmentKey: "ANALYTICS_DATABASE_URL",
    schema: "morro_analytics",
    ownerUser: "morro_analytics",
    scope: "destination-aware",
  },
];

export const canonicalDatabaseDomains = Object.freeze(
  domains.map((domain) =>
    Object.freeze({
      ...domain,
      stagingSchema: `${domain.schema}_staging`,
      stagingUser: domain.ownerUser,
    }),
  ),
);

export const databaseSchemas = Object.freeze(
  Object.fromEntries(
    canonicalDatabaseDomains.map(({ environmentKey, schema }) => [
      environmentKey,
      schema,
    ]),
  ),
);

export const runtimeDatabaseEnvironmentKeys = Object.freeze(
  canonicalDatabaseDomains.map(({ environmentKey }) => environmentKey),
);

export const stagingDatabaseDomains = Object.freeze(
  canonicalDatabaseDomains.map(({ domain }) => domain),
);

export function databaseDomainByName(domain) {
  return (
    canonicalDatabaseDomains.find((entry) => entry.domain === domain) ?? null
  );
}

export function databaseDomainByEnvironmentKey(environmentKey) {
  return (
    canonicalDatabaseDomains.find(
      (entry) => entry.environmentKey === environmentKey,
    ) ?? null
  );
}
