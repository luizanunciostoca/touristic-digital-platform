const authorizationPattern = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{5,255}$/u;
const publicKeyPattern = /^APP_USR-[A-Za-z0-9_-]{8,512}$/u;

function value(environment, name) {
  return String(environment[name] ?? "").trim();
}

function requireValue(environment, name) {
  const configured = value(environment, name);
  if (!configured) throw new Error(`${name}_REQUIRED`);
  return configured;
}

function requireExactHttpsUrl(environment, name) {
  const configured = requireValue(environment, name);
  let url;
  try {
    url = new URL(configured);
  } catch {
    throw new Error(`${name}_INVALID`);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name}_INVALID`);
  }
  return url;
}

function requireProductionPublicKey(environment, name) {
  const configured = requireValue(environment, name);
  if (!publicKeyPattern.test(configured)) {
    throw new Error(`${name}_PRODUCTION_KEY_REQUIRED`);
  }
}

function requireServerCredential(environment, name) {
  const configured = requireValue(environment, name);
  if (configured.length < 32 || configured.startsWith("TEST-")) {
    throw new Error(`${name}_PRODUCTION_CREDENTIAL_REQUIRED`);
  }
}

export function validateMercadoPagoProductionCutover(
  environment = process.env,
) {
  const mode = requireValue(environment, "MERCADO_PAGO_CHECKOUT_MODE");
  if (mode === "test") {
    return Object.freeze({
      mode,
      productionAuthorized: false,
      subscriptionsEnabled:
        value(environment, "PAYMENTS_SUBSCRIPTIONS_ENABLED") === "true",
    });
  }
  if (mode !== "production") {
    throw new Error("MERCADO_PAGO_CHECKOUT_MODE_INVALID");
  }

  if (value(environment, "NODE_ENV") !== "production") {
    throw new Error("MERCADO_PAGO_PRODUCTION_REQUIRES_NODE_ENV_PRODUCTION");
  }

  const authorizationId = requireValue(
    environment,
    "MERCADO_PAGO_PRODUCTION_AUTHORIZATION_ID",
  );
  if (!authorizationPattern.test(authorizationId)) {
    throw new Error("MERCADO_PAGO_PRODUCTION_AUTHORIZATION_ID_INVALID");
  }

  if (
    value(
      environment,
      "MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED",
    ).toLowerCase() === "true"
  ) {
    throw new Error("MERCADO_PAGO_PRODUCTION_REJECTS_TEST_CONFIRMATION");
  }

  requireServerCredential(environment, "MERCADO_PAGO_ACCESS_TOKEN");
  requireProductionPublicKey(environment, "VITE_MERCADO_PAGO_PUBLIC_KEY");

  const webhook = requireExactHttpsUrl(environment, "PAYMENTS_WEBHOOK_URL");
  if (webhook.pathname !== "/api/payments/v1/webhooks/sandbox") {
    throw new Error("PAYMENTS_WEBHOOK_URL_INVALID");
  }

  const subscriptions = value(environment, "PAYMENTS_SUBSCRIPTIONS_ENABLED");
  if (subscriptions !== "true" && subscriptions !== "false") {
    throw new Error("PAYMENTS_SUBSCRIPTIONS_ENABLED_INVALID");
  }
  if (subscriptions === "true") {
    requireServerCredential(
      environment,
      "MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN",
    );
    requireProductionPublicKey(
      environment,
      "MERCADO_PAGO_SUBSCRIPTIONS_PUBLIC_KEY",
    );
    requireExactHttpsUrl(environment, "PAYMENTS_SUBSCRIPTION_BACK_URL");
  }

  return Object.freeze({
    mode,
    productionAuthorized: true,
    authorizationId,
    subscriptionsEnabled: subscriptions === "true",
  });
}
