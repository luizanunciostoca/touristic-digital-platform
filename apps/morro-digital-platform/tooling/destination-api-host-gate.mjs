import {
  normalizePublicDestinationHost,
  resolvePublicDestinationRequest,
} from "./destination-request-resolver.mjs";

/**
 * Limit a destination-only hostname to APIs that can prove the requested
 * destination identity. The Morro legacy/default host retains V1 routes.
 * This is not an authorization replacement for tenant/private APIs.
 */
export function publicDestinationApiHostGate({
  host,
  pathname,
  query,
  allowedHosts,
  legacyDestinationId = "morro-de-sao-paulo",
  trustedDestinationScope,
}) {
  const configured = Object.keys(allowedHosts ?? {}).length > 0;
  if (!configured) return null;
  const key = normalizePublicDestinationHost(host);
  if (!key || !allowedHosts[key]) {
    return Object.freeze({
      status: 404,
      error: "DESTINATION_HOST_NOT_ALLOWED",
    });
  }
  const allowed = allowedHosts[key];
  const isNonLegacyDefault = allowed[0] !== legacyDestinationId;

  // The same host boundary must apply before the server's media and static
  // handlers, not just before its /api/* handlers. Never enable unsafe-eval
  // or route these requests to the legacy Morro document on Itacare hosts.
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return Object.freeze({ status: 404, error: "DESTINATION_PATH_INVALID" });
  }
  if (
    isNonLegacyDefault &&
    (decodedPath.startsWith("/media/") ||
      decodedPath.startsWith("/proposals/view/") ||
      decodedPath.startsWith("/contracts/view/") ||
      decodedPath
        .split("/")
        .some((segment) => segment.toLowerCase().endsWith(".html")))
  ) {
    return Object.freeze({
      status: 404,
      error: "DESTINATION_CAPABILITY_NOT_RELEASED",
    });
  }
  if (!pathname.startsWith("/api/")) return null;
  if (pathname === "/api/places/v1/map") {
    const id = query?.get("destinationId");
    if (!id || !allowed.includes(id)) {
      return Object.freeze({
        status: 404,
        error: "DESTINATION_PLACE_SCOPE_DENIED",
      });
    }
    return null;
  }
  if (
    /^\/api\/places\/v1\/[a-z0-9][a-z0-9_-]*$/u.test(pathname) &&
    trustedDestinationScope &&
    Object.hasOwn(trustedDestinationScope, "destinationId") &&
    allowed.includes(trustedDestinationScope.destinationId)
  )
    return null;
  if (isNonLegacyDefault && pathname !== "/api/runtime/destination") {
    return Object.freeze({
      status: 404,
      error: "DESTINATION_CAPABILITY_NOT_RELEASED",
    });
  }
  return null;
}

/** Derive scope from admitted host/prefix only, never browser query or forwarded headers. */
export function resolveTrustedPlaceDestinationScope({
  host,
  pathname,
  allowedHosts,
}) {
  const prefix =
    /^\/d\/([a-z0-9]+(?:-[a-z0-9]+)*)(\/api\/places\/v1\/.*)$/u.exec(pathname);
  if (pathname.startsWith("/d/") && !prefix)
    return Object.freeze({ status: 404 });
  const scope = resolvePublicDestinationRequest({
    host,
    pathname: prefix
      ? `/d/${prefix[1]}/api/runtime/destination`
      : "/api/runtime/destination",
    allowedHosts,
  });
  if (scope.status !== 200) return Object.freeze({ status: 404 });
  const effectivePath = prefix?.[2] ?? pathname;
  if (!effectivePath.startsWith("/api/places/v1/"))
    return Object.freeze({ status: 404 });
  return Object.freeze({
    status: 200,
    pathname: effectivePath,
    ...(Object.keys(allowedHosts ?? {}).length
      ? { scope: Object.freeze({ destinationId: scope.destinationId }) }
      : {}),
  });
}
