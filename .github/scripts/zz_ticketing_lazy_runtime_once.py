from pathlib import Path

path = Path("apps/morro-digital-platform/tooling/dev-server.mjs")
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one anchor, found {count}")
    text = text.replace(old, new, 1)


replace_once(
    'import { createPaymentsApi } from "./payments-api.mjs";\nimport { createTicketingApi } from "./ticketing-api.mjs";\n',
    'import { createPaymentsApi } from "./payments-api.mjs";\n',
    "remove eager ticketing import",
)

replace_once(
    '''const ticketingApi = createTicketingApi({
  authApi,
  getEnvironmentValue: (key) => process.env[key] ?? localEnvironment[key] ?? "",
});
await ticketingApi.start();

''',
    '''let ticketingApi = null;
let ticketingApiPromise = null;

async function getTicketingApi() {
  if (ticketingApi) return ticketingApi;
  if (!ticketingApiPromise) {
    ticketingApiPromise = import("./ticketing-api.mjs")
      .then(async ({ createTicketingApi }) => {
        const api = createTicketingApi({
          authApi,
          getEnvironmentValue: (key) =>
            process.env[key] ?? localEnvironment[key] ?? "",
        });
        await api.start();
        ticketingApi = api;
        return api;
      })
      .catch((error) => {
        ticketingApiPromise = null;
        throw error;
      });
  }
  return ticketingApiPromise;
}

''',
    "replace eager ticketing startup",
)

replace_once(
    '''    if (ticketingApi.matches(requestUrl.pathname)) {
      await ticketingApi.handle(request, response, requestUrl);
      return;
    }
''',
    '''    if (requestUrl.pathname.startsWith("/api/ticketing")) {
      const activeTicketingApi = await getTicketingApi();
      if (activeTicketingApi.matches(requestUrl.pathname)) {
        await activeTicketingApi.handle(request, response, requestUrl);
        return;
      }
    }
''',
    "replace ticketing route with lazy load",
)

replace_once(
    '''    void Promise.all([crmApi.stop(), paymentsApi.stop(), ticketingApi.stop()])
''',
    '''    void Promise.all([
      crmApi.stop(),
      paymentsApi.stop(),
      ticketingApi ? ticketingApi.stop() : Promise.resolve(),
    ])
''',
    "make ticketing shutdown conditional",
)

path.write_text(text)
