from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one anchor, found {count}")
    return text.replace(old, new, 1)


payments_path = Path("apps/morro-digital-platform/tooling/payments-api.mjs")
payments = payments_path.read_text()

payments = replace_once(
    payments,
    'import {\n  createProviderNeutralCheckoutApplicationService,\n  normalizeBusinessCheckoutHandoff,\n} from "@touristic/ordering";\n',
    'import {\n  createProviderNeutralCheckoutApplicationService,\n  normalizeBusinessCheckoutHandoff,\n} from "@touristic/ordering";\nimport { createTicketingCheckoutApplicationService } from "@touristic/ordering/ticketing-checkout";\n',
    "payments ordering import",
)
payments = replace_once(
    payments,
    '  MySqlCheckoutAccessRepository,\n  MySqlOrderRepository,\n  applyOrderingM151Schema,\n',
    '  MySqlCheckoutAccessRepository,\n  MySqlOrderRepository,\n  MySqlTicketingOrderBindingRepository,\n  applyOrderingM151Schema,\n  applyOrderingTicketingReservationSchema,\n',
    "payments ordering-server imports",
)
payments = replace_once(
    payments,
    '  systemCheckoutClock,\n  verifyCheckoutHandoffCapability,\n} from "@touristic/ordering-server";\n',
    '  systemCheckoutClock,\n  verifyCheckoutHandoffCapability,\n  verifyTicketingCheckoutHandoffCapability,\n} from "@touristic/ordering-server";\n',
    "payments ticketing verifier import",
)

start = payments.index("export function createPaymentsCheckoutAuthorizationPort")
end = payments.index("export function createPaymentsRefundAuthorizationPort", start)
block = payments[start:end]
anchor = '      return Object.freeze({ allowed: true, context });\n    },\n  });\n}\n\n'
addition = '''      return Object.freeze({ allowed: true, context });
    },
    async authorizeTicketingCreate(request, handoff) {
      const active = authApi.resolveSession(request);
      if (!active) {
        return Object.freeze({
          allowed: false,
          reason: "authentication_required",
        });
      }
      if (active.role === "viewer") {
        return Object.freeze({ allowed: false, reason: "read_only_role" });
      }
      const mutation = authApi.authorizeMutation(
        request,
        active,
        "checkout.create",
      );
      if (!mutation.allowed) {
        return Object.freeze({
          allowed: false,
          reason:
            mutation.reason === "invalid_csrf"
              ? "invalid_csrf"
              : "cross_origin_request",
        });
      }
      const token = header(request, "x-checkout-handoff-token");
      const context = verifyTicketingCheckoutHandoffCapability(
        token,
        handoff,
        handoffSecret,
      );
      if (
        !context ||
        context.requesterKind !== "authenticated" ||
        context.actorSubject !== active.subject ||
        context.destinationId !== destinationId
      ) {
        return Object.freeze({
          allowed: false,
          reason: "invalid_guest_capability",
        });
      }
      if (!browserOriginAllowed(request, origins, production)) {
        return Object.freeze({
          allowed: false,
          reason: "cross_origin_request",
        });
      }
      return Object.freeze({ allowed: true, context });
    },
  });
}

'''
if block.count(anchor) != 1:
    raise SystemExit(f"payments authorization anchor mismatch: {block.count(anchor)}")
payments = payments[:start] + block.replace(anchor, addition, 1) + payments[end:]

payments = replace_once(
    payments,
    '      await Promise.all([\n        applyOrderingM151Schema(orderingPool),\n        applyFinancialM145Schema(financialPool),\n      ]);\n',
    '      await Promise.all([\n        (async () => {\n          await applyOrderingM151Schema(orderingPool);\n          await applyOrderingTicketingReservationSchema(orderingPool);\n        })(),\n        applyFinancialM145Schema(financialPool),\n      ]);\n',
    "payments schema composition",
)
payments = replace_once(
    payments,
    '      const checkoutAccess = new MySqlCheckoutAccessRepository(orderingPool);\n      const rateLimits = createInMemoryCheckoutRateLimitPort();\n',
    '      const checkoutAccess = new MySqlCheckoutAccessRepository(orderingPool);\n      const paymentIdempotency = new MySqlPaymentIdempotencyPort(financialPool);\n      const identities = createNodeCheckoutIdentityPort();\n      const rateLimits = createInMemoryCheckoutRateLimitPort();\n',
    "payments shared authority ports",
)
payments = replace_once(
    payments,
    '        paymentIdempotency: new MySqlPaymentIdempotencyPort(financialPool),\n        identities: createNodeCheckoutIdentityPort(),\n',
    '        paymentIdempotency,\n        identities,\n',
    "payments business application shared ports",
)
payments = replace_once(
    payments,
    '      const origins = allowedOrigins(environment.PAYMENTS_RETURN_URL_ORIGINS);\n',
    '      const ticketingApplication = createTicketingCheckoutApplicationService({\n        orders,\n        bindings: new MySqlTicketingOrderBindingRepository(orderingPool),\n        payments,\n        paymentIdempotency,\n        identities,\n      });\n      const origins = allowedOrigins(environment.PAYMENTS_RETURN_URL_ORIGINS);\n',
    "payments ticketing application",
)
payments = replace_once(
    payments,
    '      const transport = new CheckoutHttpTransport({\n        application,\n        orders,\n',
    '      const transport = new CheckoutHttpTransport({\n        application,\n        ticketingApplication,\n        orders,\n',
    "payments ticketing transport injection",
)
payments_path.write_text(payments)

dev_path = Path("apps/morro-digital-platform/tooling/dev-server.mjs")
dev = dev_path.read_text()
dev = replace_once(
    dev,
    'import { createPaymentsApi } from "./payments-api.mjs";\n',
    'import { createPaymentsApi } from "./payments-api.mjs";\nimport { createTicketingApi } from "./ticketing-api.mjs";\n',
    "dev-server ticketing import",
)
dev = replace_once(
    dev,
    'const paymentsApi = createPaymentsApi({\n  authApi,\n  getEnvironmentValue: (key) => process.env[key] ?? localEnvironment[key] ?? "",\n});\nawait paymentsApi.start();\n\n',
    'const paymentsApi = createPaymentsApi({\n  authApi,\n  getEnvironmentValue: (key) => process.env[key] ?? localEnvironment[key] ?? "",\n});\nawait paymentsApi.start();\n\nconst ticketingApi = createTicketingApi({\n  authApi,\n  getEnvironmentValue: (key) => process.env[key] ?? localEnvironment[key] ?? "",\n});\nawait ticketingApi.start();\n\n',
    "dev-server ticketing startup",
)
dev = replace_once(
    dev,
    '    if (paymentsApi.matches(requestUrl.pathname)) {\n      await paymentsApi.handle(request, response, requestUrl);\n      return;\n    }\n    if (assistantApi.matches(requestUrl.pathname)) {\n',
    '    if (paymentsApi.matches(requestUrl.pathname)) {\n      await paymentsApi.handle(request, response, requestUrl);\n      return;\n    }\n    if (ticketingApi.matches(requestUrl.pathname)) {\n      await ticketingApi.handle(request, response, requestUrl);\n      return;\n    }\n    if (assistantApi.matches(requestUrl.pathname)) {\n',
    "dev-server ticketing route",
)
dev = replace_once(
    dev,
    '    void Promise.all([crmApi.stop(), paymentsApi.stop()])\n',
    '    void Promise.all([crmApi.stop(), paymentsApi.stop(), ticketingApi.stop()])\n',
    "dev-server ticketing shutdown",
)
dev_path.write_text(dev)
