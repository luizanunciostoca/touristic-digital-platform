import {
  applyFinancialM145Schema,
  createFinancialMySqlPoolFromEnvironment,
} from "@touristic/financial-server";
import {
  applyOrderingM151Schema,
  applyOrderingTicketingReservationSchema,
  createOrderingMySqlPoolFromEnvironment,
} from "@touristic/ordering-server";

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function requireSecretShape(name, minimumLength) {
  const value = required(name);
  if (value.length < minimumLength) throw new Error(`${name}_INVALID`);
  return value;
}

function exactHttpsOrigin(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name}_INVALID`);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error(`${name}_INVALID`);
  }
  return url.origin;
}

function validateCommaSeparatedOrigins(name) {
  const values = required(name)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0 || values.length > 20) {
    throw new Error(`${name}_INVALID`);
  }
  for (const value of values) exactHttpsOrigin(value, name);
}

function validateProviderIdentity() {
  if (required("PAYMENTS_PROVIDER_MODE") !== "mercado_pago") {
    throw new Error("PAYMENTS_PROVIDER_MODE_MUST_BE_MERCADO_PAGO");
  }
  const checkoutMode = required("MERCADO_PAGO_CHECKOUT_MODE");
  if (checkoutMode !== "test" && checkoutMode !== "production") {
    throw new Error("MERCADO_PAGO_CHECKOUT_MODE_INVALID");
  }

  let v1ProviderUrl;
  try {
    v1ProviderUrl = new URL(required("V1_PAYMENT_PROVIDER_API_URL"));
  } catch {
    throw new Error("V1_PAYMENT_PROVIDER_API_URL_INVALID");
  }
  if (
    v1ProviderUrl.protocol !== "https:" ||
    v1ProviderUrl.hostname.toLowerCase() !== "api.mercadopago.com" ||
    v1ProviderUrl.username ||
    v1ProviderUrl.password
  ) {
    throw new Error("V1_PAYMENT_PROVIDER_IS_NOT_DIRECT_MERCADO_PAGO");
  }

  requireSecretShape("MERCADO_PAGO_ACCESS_TOKEN", 32);
  requireSecretShape("MERCADO_PAGO_WEBHOOK_SECRET", 16);
  validateCommaSeparatedOrigins("MERCADO_PAGO_CHECKOUT_ORIGINS");
  validateCommaSeparatedOrigins("PAYMENTS_RETURN_URL_ORIGINS");

  let webhookUrl;
  try {
    webhookUrl = new URL(required("PAYMENTS_WEBHOOK_URL"));
  } catch {
    throw new Error("PAYMENTS_WEBHOOK_URL_INVALID");
  }
  if (
    webhookUrl.protocol !== "https:" ||
    webhookUrl.username ||
    webhookUrl.password ||
    webhookUrl.search ||
    webhookUrl.hash ||
    webhookUrl.pathname !== "/api/payments/v1/webhooks/sandbox"
  ) {
    throw new Error("PAYMENTS_WEBHOOK_URL_INVALID");
  }
}

let orderingPool;
let financialPool;

try {
  validateProviderIdentity();

  const environment = Object.freeze({
    ORDERING_DATABASE_URL: required("ORDERING_DATABASE_URL"),
    FINANCIAL_DATABASE_URL: required("FINANCIAL_DATABASE_URL"),
  });

  orderingPool = createOrderingMySqlPoolFromEnvironment(environment);
  financialPool = createFinancialMySqlPoolFromEnvironment(environment);

  await Promise.all([
    (async () => {
      await applyOrderingM151Schema(orderingPool);
      await applyOrderingTicketingReservationSchema(orderingPool);
    })(),
    applyFinancialM145Schema(financialPool),
  ]);

  await Promise.all([
    orderingPool.query("SELECT 1 AS ordering_ready"),
    financialPool.query("SELECT 1 AS financial_ready"),
  ]);

  process.stdout.write(
    `${JSON.stringify({
      contract: "PAYMENTS-PREDEPLOY",
      contractVersion: 2,
      status: "pass",
      provider: "mercado_pago",
      providerIdentity: "direct-official-api",
      ordering: "M151+ticketing-reservation",
      financial: "M145",
    })}\n`,
  );
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      contract: "PAYMENTS-PREDEPLOY",
      contractVersion: 2,
      status: "fail",
      reason:
        error instanceof Error ? error.message : "UNKNOWN_PREDEPLOY_FAILURE",
    })}\n`,
  );
  process.exitCode = 1;
} finally {
  await Promise.allSettled([
    orderingPool?.end?.() ?? Promise.resolve(),
    financialPool?.end?.() ?? Promise.resolve(),
  ]);
}
