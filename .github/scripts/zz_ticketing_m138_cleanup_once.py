from pathlib import Path

path = Path("tooling/payments/checkout-mysql-integration.test.ts")
text = path.read_text()
start_marker = "  beforeEach(async () => {"
end_marker = "\n  afterAll(async () => {"

if text.count(start_marker) != 1 or text.count(end_marker) != 1:
    raise SystemExit(
        f"markers beforeEach={text.count(start_marker)} afterAll={text.count(end_marker)}"
    )

start = text.index(start_marker)
end = text.index(end_marker, start)
replacement = '''  beforeEach(async () => {
    for (const table of [
      "ordering_subscription_renewal_intents",
      "ordering_subscriptions",
      "ordering_ticketing_reservation_bindings",
    ]) {
      try {
        await orderingPool.query(`DELETE FROM ${table}`);
      } catch (error) {
        if (
          !error ||
          typeof error !== "object" ||
          !("code" in error) ||
          error.code !== "ER_NO_SUCH_TABLE"
        ) {
          throw error;
        }
      }
    }
    await orderingPool.query("DELETE FROM ordering_checkout_access");
    await financialPool.query("DELETE FROM financial_ledger_postings");
    await financialPool.query("DELETE FROM financial_ledger_transactions");
    await financialPool.query("DELETE FROM financial_payments");
    await financialPool.query("DELETE FROM financial_payment_idempotency");
    await orderingPool.query("DELETE FROM ordering_orders");
  });
'''
path.write_text(text[:start] + replacement + text[end:])
