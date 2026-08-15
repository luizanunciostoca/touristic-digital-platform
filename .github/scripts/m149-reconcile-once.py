from collections import Counter
from pathlib import Path

source_path = Path("apps/morro-digital-platform/src/payments-browser-checkout-client.ts")
test_path = Path("apps/morro-digital-platform/src/payments-browser-checkout-client.test.ts")
matrix_path = Path("docs/migration/PAYMENTS-MIGRATION-MATRIX.md")
tracker_path = Path("docs/migration/MASTER-MIGRATION-TRACKER.md")
evidence_path = Path("docs/qa/PAYMENTS-M149-EVIDENCE.md")

source = source_path.read_text()

old = """export interface PaymentsBrowserVerifiedPayment {
  readonly verified: true;
  readonly sessionId: string;
  readonly reference: string;
  readonly definitiveBusinessId: string | null;
  readonly activationStatus: string | null;
}

export interface PaymentsBrowserCheckoutFailure {"""
new = """export interface PaymentsBrowserVerifiedPayment {
  readonly verified: true;
  readonly sessionId: string;
  readonly reference: string;
  readonly definitiveBusinessId: string | null;
  readonly activationStatus: string | null;
}

export interface PaymentsBrowserVerifiedFailure {
  readonly verified: true;
  readonly sessionId: string;
  readonly reason: string;
  readonly resultId: string;
}

export interface PaymentsBrowserCheckoutFailure {"""
assert source.count(old) == 1, "verified payment interface anchor changed"
source = source.replace(old, new, 1)

old = """interface CheckoutStatusProjection {
  readonly checkoutId: string;
  readonly sessionId: string;
  readonly status: string;
  readonly verifiedPayment: PaymentsBrowserVerifiedPayment | null;
}"""
new = """interface CheckoutStatusProjection {
  readonly checkoutId: string;
  readonly sessionId: string;
  readonly status: string;
  readonly verifiedPayment: PaymentsBrowserVerifiedPayment | null;
  readonly verifiedFailure: PaymentsBrowserVerifiedFailure | null;
}"""
assert source.count(old) == 1, "status projection interface anchor changed"
source = source.replace(old, new, 1)

old = """function statusProjection(value: unknown): CheckoutStatusProjection | null {
  const envelope = record(value);
  const data = record(envelope?.data);
  if (!data) return null;
  const checkoutId = text(data.checkoutId, 120);
  const sessionId = text(data.sessionId, 120);
  const status = text(data.status, 40);
  if (!checkoutId || !sessionId || !status) return null;
  return Object.freeze({
    checkoutId,
    sessionId,
    status,
    verifiedPayment: verifiedPayment(data.verifiedPayment),
  });
}"""
new = """function verifiedFailure(value: unknown): PaymentsBrowserVerifiedFailure | null {
  const data = record(value);
  if (!data || data.verified !== true) return null;
  const sessionId = text(data.sessionId, 120);
  const reason = text(data.reason, 80);
  const resultId = text(data.resultId, 160);
  if (!sessionId || !reason || !resultId) return null;
  return Object.freeze({ verified: true, sessionId, reason, resultId });
}

function statusProjection(value: unknown): CheckoutStatusProjection | null {
  const envelope = record(value);
  const data = record(envelope?.data);
  if (!data) return null;
  const checkoutId = text(data.checkoutId, 120);
  const sessionId = text(data.sessionId, 120);
  const status = text(data.status, 40);
  if (!checkoutId || !sessionId || !status) return null;
  return Object.freeze({
    checkoutId,
    sessionId,
    status,
    verifiedPayment: verifiedPayment(data.verifiedPayment),
    verifiedFailure: verifiedFailure(data.verifiedFailure),
  });
}"""
assert source.count(old) == 1, "status projection implementation anchor changed"
source = source.replace(old, new, 1)

old = """        if (projection.status === \"CONFIRMED\") {
          if (!projection.verifiedPayment) continue;
          if (projection.verifiedPayment.sessionId !== handoff.sessionId) {
            throw paymentFailure(
              handoff.sessionId,
              \"PAYMENTS_BROWSER_STATUS_IDENTITY_MISMATCH\",
              \"A confirmação do pagamento não corresponde a esta contratação.\",
            );
          }
          await options.signals.verified(projection.verifiedPayment);
          return projection.verifiedPayment;
        }

        if (
          projection.status === \"FAILED\" ||
          projection.status === \"CANCELLED\" ||
          projection.status === \"EXPIRED\" ||
          projection.status === \"REFUNDED\"
        ) {
          throw paymentFailure(
            handoff.sessionId,
            \"PAYMENTS_BROWSER_PAYMENT_NOT_COMPLETED\",
            \"O pagamento não foi concluído.\",
          );
        }"""
new = """        if (projection.status === \"CONFIRMED\") {
          if (projection.verifiedFailure) {
            throw paymentFailure(
              handoff.sessionId,
              \"PAYMENTS_BROWSER_INVALID_RESPONSE\",
              \"A confirmação do pagamento retornou evidências conflitantes.\",
            );
          }
          if (!projection.verifiedPayment) continue;
          if (projection.verifiedPayment.sessionId !== handoff.sessionId) {
            throw paymentFailure(
              handoff.sessionId,
              \"PAYMENTS_BROWSER_STATUS_IDENTITY_MISMATCH\",
              \"A confirmação do pagamento não corresponde a esta contratação.\",
            );
          }
          await options.signals.verified(projection.verifiedPayment);
          return projection.verifiedPayment;
        }

        if (
          projection.status === \"FAILED\" ||
          projection.status === \"CANCELLED\" ||
          projection.status === \"EXPIRED\" ||
          projection.status === \"REFUNDED\"
        ) {
          if (projection.verifiedPayment) {
            throw paymentFailure(
              handoff.sessionId,
              \"PAYMENTS_BROWSER_INVALID_RESPONSE\",
              \"A confirmação do pagamento retornou evidências conflitantes.\",
            );
          }
          if (!projection.verifiedFailure) continue;
          if (projection.verifiedFailure.sessionId !== handoff.sessionId) {
            throw paymentFailure(
              handoff.sessionId,
              \"PAYMENTS_BROWSER_STATUS_IDENTITY_MISMATCH\",
              \"A falha do pagamento não corresponde a esta contratação.\",
            );
          }
          throw paymentFailure(
            handoff.sessionId,
            \"PAYMENTS_BROWSER_PAYMENT_NOT_COMPLETED\",
            \"O pagamento não foi concluído.\",
          );
        }

        if (projection.verifiedPayment || projection.verifiedFailure) {
          throw paymentFailure(
            handoff.sessionId,
            \"PAYMENTS_BROWSER_INVALID_RESPONSE\",
            \"O estado do pagamento não corresponde à evidência verificada.\",
          );
        }"""
assert source.count(old) == 1, "terminal polling anchor changed"
source = source.replace(old, new, 1)
source_path.write_text(source)

test = test_path.read_text().replace("M148", "M149").replace("m148", "m149")
old = """  it(\"uses location fallback only when the popup is blocked\", async () => {
    const result = harness([checkoutResponse(), statusResponse(\"FAILED\")], {
      popupResult: null,
    });
    const session = await result.client.start(handoff);
    await expect(session.confirmation).rejects.toMatchObject({
      code: \"PAYMENTS_BROWSER_PAYMENT_NOT_COMPLETED\",
    });
    expect(result.assignments).toEqual([
      \"https://sandbox-payments.example.test/checkout/001\",
    ]);
    expect(result.failed).toEqual([
      expect.objectContaining({
        sessionId: handoff.sessionId,
        code: \"PAYMENTS_BROWSER_PAYMENT_NOT_COMPLETED\",
      }),
    ]);
  });"""
new = """  it(\"uses location fallback only when the popup is blocked\", async () => {
    const result = harness(
      [
        checkoutResponse(),
        statusResponse(\"FAILED\"),
        statusResponse(\"FAILED\", null, {
          verifiedFailure: {
            verified: true,
            sessionId: handoff.sessionId,
            reason: \"failed\",
            resultId: \"fev_m149_popup_failure\",
          },
        }),
      ],
      { popupResult: null },
    );
    const session = await result.client.start(handoff);
    await expect(session.confirmation).rejects.toMatchObject({
      code: \"PAYMENTS_BROWSER_PAYMENT_NOT_COMPLETED\",
    });
    expect(result.assignments).toEqual([
      \"https://sandbox-payments.example.test/checkout/001\",
    ]);
    expect(result.waits).toEqual([2_500, 2_500]);
    expect(result.failed).toEqual([
      expect.objectContaining({
        sessionId: handoff.sessionId,
        code: \"PAYMENTS_BROWSER_PAYMENT_NOT_COMPLETED\",
      }),
    ]);
  });"""
assert test.count(old) == 1, "popup fallback test anchor changed"
test = test.replace(old, new, 1)

anchor = """  it(\"fails closed when the status response belongs to another checkout or Business session\", async () => {"""
addition = """  it(\"waits for persisted verified failure evidence before emitting a failure signal\", async () => {
    const result = harness([
      checkoutResponse(),
      statusResponse(\"FAILED\"),
      statusResponse(\"FAILED\", null, {
        verifiedFailure: {
          verified: true,
          sessionId: handoff.sessionId,
          reason: \"failed\",
          resultId: \"fev_m149_verified_failure\",
        },
      }),
    ]);
    const session = await result.client.start(handoff);
    await expect(session.confirmation).rejects.toMatchObject({
      code: \"PAYMENTS_BROWSER_PAYMENT_NOT_COMPLETED\",
    });
    expect(result.waits).toEqual([2_500, 2_500]);
    expect(result.verified).toEqual([]);
    expect(result.failed).toEqual([
      expect.objectContaining({
        sessionId: handoff.sessionId,
        code: \"PAYMENTS_BROWSER_PAYMENT_NOT_COMPLETED\",
      }),
    ]);
  });

  it(\"fails closed when verified failure evidence substitutes another Business session\", async () => {
    const result = harness([
      checkoutResponse(),
      statusResponse(\"FAILED\", null, {
        verifiedFailure: {
          verified: true,
          sessionId: \"substituted_session\",
          reason: \"failed\",
          resultId: \"fev_m149_substituted_failure\",
        },
      }),
    ]);
    const session = await result.client.start(handoff);
    await expect(session.confirmation).rejects.toMatchObject({
      code: \"PAYMENTS_BROWSER_STATUS_IDENTITY_MISMATCH\",
    });
    expect(result.verified).toEqual([]);
    expect(result.failed).toEqual([
      expect.objectContaining({
        code: \"PAYMENTS_BROWSER_STATUS_IDENTITY_MISMATCH\",
      }),
    ]);
  });

""" + anchor
assert test.count(anchor) == 1, "failure evidence insertion anchor changed"
test = test.replace(anchor, addition, 1)

old = """    const result = harness([checkoutResponse(), statusResponse(\"FAILED\")], {
      authority: {
        \"X-CSRF-Token\": \"csrf-token-m149\",
        \"X-Business-ID\": \"business_12345678\",
      },
    });"""
new = """    const result = harness(
      [
        checkoutResponse(),
        statusResponse(\"FAILED\", null, {
          verifiedFailure: {
            verified: true,
            sessionId: handoff.sessionId,
            reason: \"failed\",
            resultId: \"fev_m149_authenticated_failure\",
          },
        }),
      ],
      {
        authority: {
          \"X-CSRF-Token\": \"csrf-token-m149\",
          \"X-Business-ID\": \"business_12345678\",
        },
      },
    );"""
assert test.count(old) == 1, "authenticated authority failure test anchor changed"
test = test.replace(old, new, 1)
test_path.write_text(test)

matrix = matrix_path.read_text()
if "M149 browser launch/confirmation adapter" not in matrix.splitlines()[0]:
    first_line, rest = matrix.split("\n", 1)
    assert first_line.startswith("# Payments / Ordering / Financial — Migration Matrix")
    matrix = "# Payments / Ordering / Financial — Migration Matrix (M149 browser launch/confirmation adapter)\n" + rest

old = "The adapter derives the exact `business:<sessionId>:<planId>` idempotency key, creates checkout with same-origin credentials, keeps the plaintext status capability private to the client closure, opens the provider URL with `noopener,noreferrer` plus blocked-popup location fallback, and preserves the frozen V1 polling budget of 2500 ms × 240 attempts. `CONFIRMED` alone is not success: only the authoritative persisted `verifiedPayment` projection can emit `businessPaymentVerified`; terminal/timeout paths emit bounded `businessPaymentVerificationFailed`."
new = "The adapter derives the exact `business:<sessionId>:<planId>` idempotency key from Ordering, creates checkout with same-origin credentials, keeps the plaintext status capability private to the client closure, opens the provider URL with `noopener,noreferrer` plus blocked-popup location fallback, and preserves the frozen V1 polling budget of 2500 ms × 240 attempts. Confirmation is symmetric and server-authoritative: `CONFIRMED` is success only after an identity-matched persisted `verifiedPayment`; terminal Payment status is failure only after an identity-matched persisted `verifiedFailure`. A terminal row without its verified result remains an incomplete recovery window and continues bounded polling. Browser timeout is a local wait failure and does not fabricate a Financial result."
assert matrix.count(old) == 1, "matrix M149 boundary anchor changed"
matrix = matrix.replace(old, new, 1)

lines = matrix.splitlines()
for index, line in enumerate(lines):
    if line.startswith("| Browser confirmation wait "):
        lines[index] = "| Browser confirmation wait | poll every 2.5 s, max 240 attempts | M149 preserves 2500 ms × 240 attempts, keeps the status capability private and waits for persisted verified Financial evidence | PASS | A popup/return URL or bare Payment status is never confirmation. |"
    elif line.startswith("| Browser failure event "):
        lines[index] = "| Browser failure event | `businessPaymentVerificationFailed` | M149 emits terminal Payment failure only from an identity-matched persisted `verifiedFailure`; terminal state without that evidence keeps polling, while bounded timeout remains a local client failure | PASS | Failure signalling cannot manufacture a Financial result and carries no mutation authority. |"
matrix = "\n".join(lines) + "\n"
matrix = matrix.replace(
    "M149 closes the Payments-owned browser launch, bounded confirmation wait and Business-compatible result-signal contracts while preserving the audited M139 authority boundary. It does not make the public Business onboarding capable of creating a checkout by itself.",
    "M149 closes the Payments-owned browser launch, bounded confirmation wait and Business-compatible result-signal contracts while preserving the audited M139 authority boundary and requiring persisted Financial evidence for both success and terminal failure. It does not make the public Business onboarding capable of creating a checkout by itself.",
    1,
)
matrix = matrix.replace(
    "- browser launch/polling and Business-compatible verified/failure signals are executable but require a legitimate M139 create authority supplied outside the client;\n- automatic public `businessCheckoutRequested` → Payments composition remains disabled;",
    "- browser launch/polling and Business-compatible result signals are executable but require a legitimate M139 create authority supplied outside the client;\n- both success and terminal failure require their persisted, identity-matched Financial result before a Business-compatible signal is emitted;\n- automatic public `businessCheckoutRequested` → Payments composition remains disabled;",
    1,
)
statuses = []
for line in matrix.splitlines():
    if not line.startswith("| ") or line.startswith("| Contract") or line.startswith("| ---"):
        continue
    cells = [cell.strip() for cell in line.split("|")[1:-1]]
    if len(cells) >= 4 and cells[3] in {"PASS", "PARTIAL", "GAP", "N/A"}:
        statuses.append(cells[3])
counts = Counter(statuses)
assert counts == Counter({"PASS": 27, "PARTIAL": 5, "GAP": 1, "N/A": 1}) and len(statuses) == 34
matrix_path.write_text(matrix)

tracker = tracker_path.read_text()
tracker = tracker.replace(
    "34 contratos: 27 PASS / 5 PARTIAL / 1 GAP / 1 N/A; checkout browser exige autoridade M139 legítima e só `verifiedPayment` autoritativo produz sucesso",
    "34 contratos: 27 PASS / 5 PARTIAL / 1 GAP / 1 N/A; sucesso e falha terminal browser exigem resultado Financial persistido e identity-matched",
    1,
)
tracker = tracker.replace(
    "- `CONFIRMED` sem `verifiedPayment` não converte nem encerra como sucesso;\n- emite `businessPaymentVerified` somente do resultado Financial autoritativo e usa `businessPaymentVerificationFailed` para falha/timeout terminal;",
    "- `CONFIRMED` sem `verifiedPayment` continua polling como janela de recuperação;\n- estado terminal sem `verifiedFailure` continua polling como janela de recuperação;\n- emite sucesso ou falha terminal somente de resultados Financial persistidos, autoritativos e identity-matched; timeout é falha local de espera e não cria resultado Financial;",
    1,
)
tracker_path.write_text(tracker)

evidence = evidence_path.read_text()
evidence = evidence.replace(
    "- treats `CONFIRMED` without authoritative `verifiedPayment` as incomplete and continues polling;\n- fails closed on checkout/session identity substitution, terminal failure and timeout;\n- emits the existing Business-compatible `businessPaymentVerified` and `businessPaymentVerificationFailed` signals without granting either signal financial mutation authority.",
    "- treats `CONFIRMED` without persisted `verifiedPayment` as incomplete and continues polling;\n- treats terminal Payment status without persisted `verifiedFailure` as incomplete and continues polling;\n- emits terminal payment failure only after `verifiedFailure` is persisted and identity-matched to the Business session;\n- rejects contradictory result/status pairs and identity substitution fail-closed;\n- treats bounded browser timeout as a local confirmation failure without fabricating a Financial result;\n- emits the existing Business-compatible result signals without granting either signal financial mutation authority.",
    1,
)
evidence = evidence.replace(
    "The browser proof validates launch headers/idempotency, private status-token reuse, bounded polling, authoritative confirmation, Business success/failure signalling, safe popup behavior, blocked-popup fallback, zero storage persistence of the status capability and zero page errors.",
    "The browser proof validates launch headers/idempotency, private status-token reuse, bounded polling, persisted-result recovery windows for success and failure, Business-compatible result signalling, safe popup behavior, blocked-popup fallback, zero storage persistence of the status capability and zero page errors.",
    1,
)
evidence_path.write_text(evidence)
