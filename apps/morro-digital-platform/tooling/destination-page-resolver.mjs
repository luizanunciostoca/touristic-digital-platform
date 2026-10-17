import { resolvePublicDestinationRequest } from "./destination-request-resolver.mjs";

const PAGE = /^\/d\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/)?$/u;

/**
 * Public HTML must be rendered only after the same trusted-host scope
 * resolution as /api/runtime/destination. No cross-destination Morro shell.
 */
export function resolvePublicDestinationPage({ host, pathname, allowedHosts }) {
  const match = PAGE.exec(pathname);
  if (pathname !== "/" && !match) {
    return Object.freeze({ status: 404, error: "DESTINATION_PAGE_NOT_FOUND" });
  }
  const endpoint = match
    ? `/d/${match[1]}/api/runtime/destination`
    : "/api/runtime/destination";
  const scope = resolvePublicDestinationRequest({
    host,
    pathname: endpoint,
    allowedHosts,
  });
  if (scope.status !== 200) {
    return Object.freeze({ status: scope.status, error: scope.error });
  }
  return Object.freeze({
    status: 200,
    destinationId: scope.destinationId,
    pageKind:
      !match && scope.destinationId === "morro-de-sao-paulo"
        ? "legacy-morro"
        : "governed-destination",
  });
}
