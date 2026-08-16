from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one anchor, found {count}")
    return text.replace(old, new, 1)


transport_path = Path("services/ordering/src/checkout-http-transport.ts")
transport = transport_path.read_text()
transport = replace_once(
    transport,
    '  return errorResponse(403, "ACCESS_DENIED", correlationId);',
    '  return errorResponse(403, "BUSINESS_ACCESS_DENIED", correlationId);',
    "restore M139 access-denied contract",
)
transport = replace_once(
    transport,
    '        reason: `${selected.kind}:${replayed ? "replayed" : "created"}`,',
    '        reason:\n          selected.kind === "business"\n            ? replayed\n              ? "replayed"\n              : "created"\n            : `ticketing:${replayed ? "replayed" : "created"}`,',
    "preserve M139 success audit reason",
)
transport = replace_once(
    transport,
    '        reason:\n          error instanceof CheckoutApplicationError\n            ? error.code\n            : error instanceof Error\n              ? error.message.slice(0, 120)\n              : "internal_failure",',
    '        reason:\n          error instanceof CheckoutApplicationError\n            ? error.code\n            : "internal_failure",',
    "restore sanitized M139 failure audit reason",
)
transport_path.write_text(transport)

test_path = Path(
    "services/ordering/src/ticketing-order-binding-mysql-integration.test.ts"
)
test = test_path.read_text()
test = replace_once(
    test,
    '  beforeEach(async () => {\n    await pool.query("DELETE FROM ordering_ticketing_reservation_bindings");\n    await pool.query("DELETE FROM ordering_orders");\n  });',
    '  beforeEach(async () => {\n    await pool.query("DELETE FROM ordering_subscription_renewal_intents");\n    await pool.query("DELETE FROM ordering_subscriptions");\n    await pool.query("DELETE FROM ordering_ticketing_reservation_bindings");\n    await pool.query("DELETE FROM ordering_orders");\n  });',
    "respect M153 foreign-key cleanup order",
)
test_path.write_text(test)
