const authorizationPattern = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{5,255}$/u;

function value(environment, name) {
  return String(environment[name] ?? "").trim();
}

function requireValue(environment, name) {
  const configured = value(environment, name);
  if (!configured) throw new Error(`${name}_REQUIRED`);
  return configured;
}

function requireBoolean(environment, name) {
  const configured = requireValue(environment, name).toLowerCase();
  if (configured !== "true" && configured !== "false") {
    throw new Error(`${name}_INVALID`);
  }
  return configured === "true";
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

function requirePublicCredential(environment, name) {
  const configured = requireValue(environment, name);
  if (configured.length < 16) {
    throw new Error(`${name}_INVALID`);
  }
}

function requireServerCredential(environment, name) {
  const configured = requireValue(environment, name);
  if (configured.length < 32) {
    throw new Error(`${name}_INVALID`);
  }
}

export function validateMercadoPagoProductionCutover(
  environment = process.env,
) {
  const mode = requireValue(environment, "MERCADO_PAGO_CHECKOUT_MODE");
  const subscriptionsEnabled = requireBoolean(
    environment,
    "PAYMENTS_SUBSCRIPTIONS_ENABLED",
  );

  // Browser-safe Bricks configuration is required in every provider mode.
  requirePublicCredential(environment, "VITE_MERCADO_PAGO_PUBLIC_KEY");

  // Recurring billing has its own provider application/credentials and callback.
  // Validate the complete binding before mode-specific authorization checks.
  if (subscriptionsEnabled) {
    requireServerCredential(
      environment,
      "MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN",
    );
    requirePublicCredential(
      environment,
      "MERCADO_PAGO_SUBSCRIPTIONS_PUBLIC_KEY",
    );
    requireExactHttpsUrl(environment, "PAYMENTS_SUBSCRIPTION_BACK_URL");
  }

  if (mode === "test") {
    if (
      !requireBoolean(environment, "MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED")
    ) {
      throw new Error("MERCADO_PAGO_TEST_CREDENTIALS_NOT_CONFIRMED");
    }
    return Object.freeze({
      mode,
      productionAuthorized: false,
      productionCredentialsConfirmed: false,
      subscriptionsEnabled,
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

  if (requireBoolean(environment, "MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED")) {
    throw new Error("MERCADO_PAGO_PRODUCTION_REJECTS_TEST_CONFIRMATION");
  }

  if (
    !requireBoolean(
      environment,
      "MERCADO_PAGO_PRODUCTION_CREDENTIALS_CONFIRMED",
    )
  ) {
    throw new Error("MERCADO_PAGO_PRODUCTION_CREDENTIALS_NOT_CONFIRMED");
  }

  requireServerCredential(environment, "MERCADO_PAGO_ACCESS_TOKEN");

  const webhook = requireExactHttpsUrl(environment, "PAYMENTS_WEBHOOK_URL");
  if (webhook.pathname !== "/api/payments/v1/webhooks/sandbox") {
    throw new Error("PAYMENTS_WEBHOOK_URL_INVALID");
  }

  return Object.freeze({
    mode,
    productionAuthorized: true,
    productionCredentialsConfirmed: true,
    authorizationId,
    subscriptionsEnabled,
  });
}
