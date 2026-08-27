import { defineConfig } from "vitest/config";

const source = (packageName, entry = "index.ts") =>
  new URL(`../../packages/${packageName}/src/${entry}`, import.meta.url)
    .pathname;
const serviceSource = (serviceName, entry = "index.ts") =>
  new URL(`../../services/${serviceName}/src/${entry}`, import.meta.url)
    .pathname;

export default defineConfig({
  resolve: {
    alias: [
      { find: "@touristic/assistant", replacement: source("assistant") },
      { find: "@touristic/auth", replacement: source("auth") },
      { find: "@touristic/auth-browser", replacement: source("auth-browser") },
      {
        find: "@touristic/business/onboarding-commercial-conversion",
        replacement: source("business", "onboarding-commercial-conversion.ts"),
      },
      {
        find: "@touristic/business/onboarding-presentation",
        replacement: source("business", "onboarding-presentation.ts"),
      },
      {
        find: "@touristic/business/onboarding-recommendation",
        replacement: source("business", "onboarding-recommendation.ts"),
      },
      {
        find: "@touristic/business/onboarding-workspace",
        replacement: source("business", "onboarding-workspace.ts"),
      },
      {
        find: "@touristic/business/onboarding-profile",
        replacement: source("business", "onboarding-profile.ts"),
      },
      {
        find: "@touristic/business/onboarding-host",
        replacement: source("business", "onboarding-host.ts"),
      },
      {
        find: "@touristic/business/onboarding-steps",
        replacement: source("business", "onboarding-steps.ts"),
      },
      {
        find: "@touristic/business/onboarding",
        replacement: source("business", "onboarding.ts"),
      },
      { find: "@touristic/business", replacement: source("business") },
      { find: "@touristic/core", replacement: source("core") },
      { find: "@touristic/shared", replacement: source("shared") },
      {
        find: "@touristic/crm/lead-detail-contract",
        replacement: source("crm", "lead-detail-contract.ts"),
      },
      {
        find: "@touristic/crm/settings-contract",
        replacement: source("crm", "settings-contract.ts"),
      },
      { find: "@touristic/geospatial", replacement: source("geospatial") },
      { find: "@touristic/navigation", replacement: source("navigation") },
      {
        find: "@touristic/financial/card-payment",
        replacement: source("financial", "card-payment.ts"),
      },
      {
        find: "@touristic/financial/subscription-provider",
        replacement: source("financial", "subscription-provider.ts"),
      },
      {
        find: "@touristic/financial/settlement",
        replacement: source("financial", "settlement.ts"),
      },
      { find: "@touristic/financial", replacement: source("financial") },
      {
        find: "@touristic/ordering/subscription-activation-application",
        replacement: source(
          "ordering",
          "subscription-activation-application.ts",
        ),
      },
      {
        find: "@touristic/ordering/subscription-application",
        replacement: source("ordering", "subscription-application.ts"),
      },
      {
        find: "@touristic/ordering/ticketing-reservation",
        replacement: source("ordering", "ticketing-reservation.ts"),
      },
      {
        find: "@touristic/ordering/ticketing-checkout",
        replacement: source("ordering", "ticketing-checkout.ts"),
      },
      {
        find: "@touristic/ordering/subscription",
        replacement: source("ordering", "subscription.ts"),
      },
      { find: "@touristic/ordering", replacement: source("ordering") },
      {
        find: "@touristic/ordering-server",
        replacement: serviceSource("ordering"),
      },
      {
        find: "@touristic/financial-server/mercado-pago-card-payment",
        replacement: serviceSource(
          "financial",
          "mercado-pago-card-payment-provider.ts",
        ),
      },
      {
        find: "@touristic/financial-server/mercado-pago-subscription",
        replacement: serviceSource(
          "financial",
          "mercado-pago-subscription-credentials-provider.ts",
        ),
      },
      {
        find: "@touristic/financial-server/provider-subscription-repository",
        replacement: serviceSource(
          "financial",
          "mysql-provider-subscription-repository.ts",
        ),
      },
      {
        find: "@touristic/financial-server/provider-subscription-schema",
        replacement: serviceSource(
          "financial",
          "provider-subscription-schema.ts",
        ),
      },
      {
        find: "@touristic/financial-server/settlement",
        replacement: serviceSource("financial", "settlement.ts"),
      },
      {
        find: "@touristic/financial-server",
        replacement: serviceSource("financial"),
      },
      { find: "@touristic/auth-server", replacement: serviceSource("auth") },
      { find: "@touristic/crm-server", replacement: serviceSource("crm") },
    ],
  },
});
