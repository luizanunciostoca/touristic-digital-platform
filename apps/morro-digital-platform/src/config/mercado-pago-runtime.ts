export interface MorroMercadoPagoRuntimeConfig {
  readonly publicKey: string;
  readonly credentialMode: "test" | "production";
}

export type MercadoPagoRuntimeEnvironment = Readonly<
  Record<string, string | undefined>
>;

const publicKeyEnvironmentKey = "VITE_MERCADO_PAGO_PUBLIC_KEY";
const forbiddenBrowserCredentialKeys = Object.freeze([
  "VITE_MERCADO_PAGO_ACCESS_TOKEN",
  "VITE_MERCADO_PAGO_WEBHOOK_SECRET",
  "VITE_PAYMENTS_STATUS_TOKEN_SECRET",
  "VITE_PAYMENTS_HANDOFF_SECRET",
] as const);

const publicKeyPattern = /^(?:TEST-|APP_USR-)[A-Za-z0-9_-]{8,512}$/u;

function browserCredentialLeak(
  environment: MercadoPagoRuntimeEnvironment,
): string | null {
  for (const key of forbiddenBrowserCredentialKeys) {
    if (environment[key]?.trim()) return key;
  }
  return null;
}

function requirePublicKey(environment: MercadoPagoRuntimeEnvironment): string {
  const leakedCredentialKey = browserCredentialLeak(environment);
  if (leakedCredentialKey) {
    throw new Error(
      `Server-only Mercado Pago credential must not be exposed to the browser: ${leakedCredentialKey}.`,
    );
  }

  const value = environment[publicKeyEnvironmentKey]?.trim();
  if (!value) {
    throw new Error(
      `Required environment variable is missing: ${publicKeyEnvironmentKey}.`,
    );
  }
  if (!publicKeyPattern.test(value)) {
    throw new Error(
      `${publicKeyEnvironmentKey} has an invalid public-key format.`,
    );
  }
  return value;
}

export function loadMorroMercadoPagoRuntimeConfig(
  environment: MercadoPagoRuntimeEnvironment,
): MorroMercadoPagoRuntimeConfig {
  const publicKey = requirePublicKey(environment);
  return Object.freeze({
    publicKey,
    credentialMode: publicKey.startsWith("TEST-") ? "test" : "production",
  });
}
