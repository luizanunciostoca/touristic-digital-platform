import { createDashboardAuthClient } from "@touristic/auth-browser";
import { createBusinessDashboardClient } from "./business-dashboard-client.js";
import { mountBusinessDashboardSurface } from "./business-dashboard-surface.js";

const locationPort = {
  origin: window.location.origin,
  pathname: window.location.pathname,
  search: window.location.search,
  replace: (url: string) => window.location.replace(url),
};

const authClient = createDashboardAuthClient({
  fetchFn: window.fetch.bind(window),
  storage: window.sessionStorage,
  location: locationPort,
});

const dashboardClient = createBusinessDashboardClient(authClient);

void mountBusinessDashboardSurface({
  document: window.document,
  storage: window.localStorage,
  search: window.location.search,
  dashboardClient,
  authClient,
});
