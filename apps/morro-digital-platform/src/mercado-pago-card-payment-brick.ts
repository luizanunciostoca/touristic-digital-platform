import { loadMorroMercadoPagoRuntimeConfig } from "./config/mercado-pago-runtime.js";

const mercadoPagoSdkUrl = "https://sdk.mercadopago.com/js/v2";
const sdkMarker = "data-morro-mercado-pago-sdk";
const sdkTimeoutMs = 15_000;
const maxResponseBytes = 64 * 1024;

interface MercadoPagoBrickController {
  unmount?(): Promise<void> | void;
}

interface MercadoPagoBricksBuilder {
  create(
    brick: "cardPayment",
    containerId: string,
    settings: Readonly<Record<string, unknown>>,
  ): Promise<MercadoPagoBrickController>;
}

interface MercadoPagoInstance {
  bricks(): MercadoPagoBricksBuilder;
}

interface MercadoPagoConstructor {
  new (
    publicKey: string,
    options?: Readonly<Record<string, unknown>>,
  ): MercadoPagoInstance;
}

interface MercadoPagoWindow extends Window {
  MercadoPago?: MercadoPagoConstructor;
  __MORRO_RUNTIME_ENV__?: Readonly<Record<string, string | undefined>>;
}

export interface CardPaymentBrickPlan {
  readonly amount: Readonly<{
    minorUnits: number;
    currency: string;
  }>;
}

export interface CardPaymentBrickSession {
  readonly checkoutId: string;
  readonly statusToken: string;
  readonly plan: CardPaymentBrickPlan;
  readonly payerEmail: string;
}

export interface CardPaymentBrickSubmission {
  readonly token: string;
  readonly installments: number;
  readonly payment_method_id: string;
  readonly issuer_id?: string;
  readonly payer: Readonly<{ email: string }>;
}

export interface MercadoPagoCardPaymentBrick {
  available: boolean;
  present(session: CardPaymentBrickSession): Promise<void>;
  destroy(): Promise<void>;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength
    ? normalized
    : "";
}

function email(value: unknown): string {
  const normalized = text(value, 200).toLowerCase();
  return /^\S+@\S+\.\S+$/u.test(normalized) ? normalized : "";
}

function safeCurrency(value: unknown): string {
  const normalized = text(value, 3).toUpperCase();
  return /^[A-Z]{3}$/u.test(normalized) ? normalized : "";
}

export function normalizeCardPaymentBrickSubmission(
  input: unknown,
): CardPaymentBrickSubmission | null {
  const value = record(input);
  const payer = record(value?.payer);
  if (!value) return null;

  const token = text(value.token, 512);
  const paymentMethodId = text(
    value.payment_method_id ?? value.paymentMethodId,
    80,
  );
  const issuerRaw = value.issuer_id ?? value.issuerId;
  const issuerId =
    issuerRaw === null || issuerRaw === undefined || issuerRaw === ""
      ? ""
      : text(issuerRaw, 80);
  const payerEmail = email(payer?.email ?? value.email);
  const installments = value.installments;

  if (
    !token ||
    !paymentMethodId ||
    !payerEmail ||
    typeof installments !== "number" ||
    !Number.isSafeInteger(installments) ||
    installments < 1 ||
    installments > 48 ||
    (issuerRaw !== null &&
      issuerRaw !== undefined &&
      issuerRaw !== "" &&
      !issuerId)
  ) {
    return null;
  }

  return Object.freeze({
    token,
    installments,
    payment_method_id: paymentMethodId,
    ...(issuerId ? { issuer_id: issuerId } : {}),
    payer: Object.freeze({ email: payerEmail }),
  });
}

async function boundedJson(
  response: Response,
): Promise<Record<string, unknown>> {
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > maxResponseBytes) {
    throw new Error("PAYMENTS_BRICK_RESPONSE_TOO_LARGE");
  }
  try {
    const parsed = JSON.parse(body) as unknown;
    const parsedRecord = record(parsed);
    if (!parsedRecord) throw new Error("invalid");
    return parsedRecord;
  } catch {
    throw new Error("PAYMENTS_BRICK_INVALID_RESPONSE");
  }
}

export async function submitCardPaymentBrickForm(
  fetchFn: typeof fetch,
  input: Readonly<{
    checkoutId: string;
    statusToken: string;
    correlationId: string;
    formData: unknown;
  }>,
): Promise<void> {
  const checkoutId = text(input.checkoutId, 120);
  const statusToken = text(input.statusToken, 256);
  const correlationId = text(input.correlationId, 120);
  const submission = normalizeCardPaymentBrickSubmission(input.formData);
  if (
    !checkoutId.startsWith("ord_") ||
    !statusToken.startsWith("cst_v1_") ||
    !correlationId ||
    !submission
  ) {
    throw new Error("PAYMENTS_BRICK_INVALID_SUBMISSION");
  }

  const response = await fetchFn(
    `/api/payments/v1/checkouts/${encodeURIComponent(checkoutId)}/card`,
    {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Checkout-Token": statusToken,
        "X-Correlation-ID": correlationId,
      },
      body: JSON.stringify(submission),
    },
  );
  const payload = await boundedJson(response);
  if (!response.ok) {
    const error = text(payload.error, 120) || "CARD_PAYMENT_REJECTED";
    throw new Error(`PAYMENTS_BRICK_SUBMISSION_REJECTED:${error}`);
  }
  const data = record(payload.data);
  if (
    !data ||
    data.checkoutId !== checkoutId ||
    data.submitted !== true ||
    typeof data.status !== "string"
  ) {
    throw new Error("PAYMENTS_BRICK_INVALID_RESPONSE");
  }
}

function createCorrelationId(view: Window): string {
  if (typeof view.crypto?.randomUUID !== "function") {
    throw new Error("PAYMENTS_BRICK_CORRELATION_UNAVAILABLE");
  }
  return `brick:${view.crypto.randomUUID()}`;
}

function resolveMercadoPagoConstructor(
  view: MercadoPagoWindow,
): MercadoPagoConstructor | null {
  return typeof view.MercadoPago === "function" ? view.MercadoPago : null;
}

function loadMercadoPagoSdk(
  view: MercadoPagoWindow,
  document: Document,
): Promise<MercadoPagoConstructor> {
  const existing = resolveMercadoPagoConstructor(view);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (
      constructor: MercadoPagoConstructor | null,
      error?: Error,
    ) => {
      if (settled) return;
      settled = true;
      view.clearTimeout(timeoutId);
      if (constructor) resolve(constructor);
      else reject(error ?? new Error("PAYMENTS_BRICK_SDK_UNAVAILABLE"));
    };

    const onLoad = () =>
      finish(
        resolveMercadoPagoConstructor(view),
        new Error("PAYMENTS_BRICK_SDK_INVALID"),
      );
    const onError = () =>
      finish(null, new Error("PAYMENTS_BRICK_SDK_UNAVAILABLE"));
    const selector = `script[${sdkMarker}="v2"]`;
    const existingScript = document.querySelector<HTMLScriptElement>(selector);
    const script = existingScript ?? document.createElement("script");
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });

    if (!existingScript) {
      script.src = mercadoPagoSdkUrl;
      script.async = true;
      script.setAttribute(sdkMarker, "v2");
      document.head.appendChild(script);
    }

    const timeoutId = view.setTimeout(
      () => finish(null, new Error("PAYMENTS_BRICK_SDK_TIMEOUT")),
      sdkTimeoutMs,
    );
  });
}

function createSurface(document: Document): Readonly<{
  overlay: HTMLDivElement;
  container: HTMLDivElement;
}> {
  const overlay = document.createElement("div");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Pagamento seguro");
  overlay.dataset.morroPaymentsBrick = "card";
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483000",
    background: "rgba(15, 23, 42, 0.72)",
    display: "grid",
    placeItems: "center",
    padding: "16px",
    overflow: "auto",
  });

  const panel = document.createElement("section");
  Object.assign(panel.style, {
    width: "min(100%, 560px)",
    background: "#ffffff",
    borderRadius: "20px",
    padding: "20px",
    boxShadow: "0 24px 80px rgba(15, 23, 42, 0.35)",
  });

  const title = document.createElement("h2");
  title.textContent = "Pagamento seguro";
  Object.assign(title.style, { margin: "0 0 12px", fontSize: "20px" });

  const container = document.createElement("div");
  container.id = `morro-mercado-pago-card-${Math.random().toString(36).slice(2)}`;

  panel.append(title, container);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  return Object.freeze({ overlay, container });
}

export function createMercadoPagoCardPaymentBrick(
  viewInput: Window,
  document: Document,
  fetchFn: typeof fetch = viewInput.fetch.bind(viewInput),
): MercadoPagoCardPaymentBrick {
  const view = viewInput as MercadoPagoWindow;
  const runtimeEnvironment = view.__MORRO_RUNTIME_ENV__ ?? {};
  const rawPublicKey =
    runtimeEnvironment.VITE_MERCADO_PAGO_PUBLIC_KEY?.trim() ?? "";
  if (!rawPublicKey) {
    return Object.freeze({
      available: false,
      async present(): Promise<void> {
        throw new Error("PAYMENTS_BRICK_NOT_CONFIGURED");
      },
      async destroy(): Promise<void> {},
    });
  }

  const config = loadMorroMercadoPagoRuntimeConfig(runtimeEnvironment);
  let controller: MercadoPagoBrickController | null = null;
  let overlay: HTMLDivElement | null = null;

  async function destroy(): Promise<void> {
    const activeController = controller;
    controller = null;
    overlay?.remove();
    overlay = null;
    await activeController?.unmount?.();
  }

  return Object.freeze({
    available: true,
    async present(session: CardPaymentBrickSession): Promise<void> {
      await destroy();
      const minorUnits = session.plan.amount.minorUnits;
      const currency = safeCurrency(session.plan.amount.currency);
      const payerEmail = email(session.payerEmail);
      if (
        !Number.isSafeInteger(minorUnits) ||
        minorUnits <= 0 ||
        currency !== "BRL" ||
        !payerEmail
      ) {
        throw new Error("PAYMENTS_BRICK_INVALID_SERVER_PLAN");
      }

      const Constructor = await loadMercadoPagoSdk(view, document);
      const mercadoPago = new Constructor(config.publicKey, {
        locale: "pt-BR",
      });
      const surface = createSurface(document);
      overlay = surface.overlay;

      const submission = new Promise<void>((resolve, reject) => {
        void mercadoPago
          .bricks()
          .create("cardPayment", surface.container.id, {
            initialization: {
              amount: minorUnits / 100,
              payer: { email: payerEmail },
            },
            callbacks: {
              onReady: () => undefined,
              onSubmit: async (formData: unknown) => {
                try {
                  await submitCardPaymentBrickForm(fetchFn, {
                    checkoutId: session.checkoutId,
                    statusToken: session.statusToken,
                    correlationId: createCorrelationId(view),
                    formData,
                  });
                  resolve();
                  await destroy();
                } catch (error) {
                  reject(error);
                  await destroy();
                  throw error;
                }
              },
              onError: (error: unknown) => {
                reject(
                  error instanceof Error
                    ? error
                    : new Error("PAYMENTS_BRICK_PROVIDER_UI_FAILURE"),
                );
              },
            },
          })
          .then((createdController) => {
            controller = createdController;
          })
          .catch(reject);
      });

      return submission;
    },
    destroy,
  });
}
