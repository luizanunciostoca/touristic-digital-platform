import { pathToFileURL } from "node:url";
import path from "node:path";

const DEFAULT_DESTINATION_ID = "morro-de-sao-paulo";
const DEFAULT_BBOX = "-39.05,-13.5,-38.89,-13.35";
const DEFAULT_ZOOM = "13";
const DEFAULT_LIMIT = "1000";

function absoluteUrl(baseUrl, pathname) {
  return new URL(pathname, baseUrl).toString();
}

async function fetchJson(fetchImpl, url) {
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      `PLACE_MEDIA_COVERAGE_HTTP_${response.status}:${new URL(url).pathname}`,
    );
  }
  return response.json();
}

async function loadCanonicalPlaces(fetchImpl, baseUrl) {
  const url = new URL("/api/places/v1/map", baseUrl);
  url.searchParams.set("destinationId", DEFAULT_DESTINATION_ID);
  url.searchParams.set("bbox", DEFAULT_BBOX);
  url.searchParams.set("zoom", DEFAULT_ZOOM);
  url.searchParams.set("limit", DEFAULT_LIMIT);

  const items = [];
  let cursor = null;
  do {
    if (cursor) url.searchParams.set("cursor", cursor);
    else url.searchParams.delete("cursor");
    const page = await fetchJson(fetchImpl, url.toString());
    if (!Array.isArray(page?.items)) {
      throw new Error("PLACE_MEDIA_COVERAGE_MAP_RESPONSE_INVALID");
    }
    for (const item of page.items) {
      if (
        typeof item?.id === "string" &&
        item.id &&
        typeof item?.name === "string" &&
        item.name
      ) {
        items.push({ id: item.id, name: item.name });
      }
    }
    cursor =
      typeof page?.nextCursor === "string" && page.nextCursor
        ? page.nextCursor
        : null;
  } while (cursor);

  return items;
}

export async function runPlaceMediaCoverageAudit({
  baseUrl,
  fetchImpl = globalThis.fetch,
  audit,
  legacyEntries,
  legacyPlaceNames,
}) {
  if (!baseUrl) throw new Error("MORRO_V2_BASE_URL_REQUIRED");
  if (typeof fetchImpl !== "function") {
    throw new Error("PLACE_MEDIA_COVERAGE_FETCH_UNAVAILABLE");
  }
  if (typeof audit !== "function") {
    throw new Error("PLACE_MEDIA_COVERAGE_AUDIT_REQUIRED");
  }

  const canonicalPlaces = await loadCanonicalPlaces(fetchImpl, baseUrl);

  const getDetail = async (placeId) => {
    const detailUrl = new URL(
      `/api/places/v1/${encodeURIComponent(placeId)}`,
      baseUrl,
    );
    detailUrl.searchParams.set("locale", "pt-BR");
    const response = await fetchImpl(detailUrl.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(
        `PLACE_MEDIA_COVERAGE_DETAIL_HTTP_${response.status}:${placeId}`,
      );
    }
    return response.json();
  };

  const matrix = await audit({
    canonicalPlaces,
    legacyPlaceNames,
    legacyEntries,
    getDetail,
  });

  return Object.freeze({
    generatedAt: new Date().toISOString(),
    baseUrl: new URL(baseUrl).origin,
    destinationId: DEFAULT_DESTINATION_ID,
    canonicalPlaceCount: canonicalPlaces.length,
    ...matrix,
  });
}

async function runCli() {
  const baseUrl = process.env.MORRO_V2_BASE_URL?.trim();
  if (!baseUrl) throw new Error("MORRO_V2_BASE_URL_REQUIRED");

  const repositoryRoot = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "../../..",
  );
  const assistantDist = path.join(
    repositoryRoot,
    "apps/morro-digital-platform/dist/assistant",
  );
  const searchDist = path.join(repositoryRoot, "packages/search/dist/index.js");

  const [
    { auditAssistantPhotoMigrationCoverage },
    { listAssistantV1PhotoCatalogEntries },
    search,
  ] = await Promise.all([
    import(
      pathToFileURL(
        path.join(assistantDist, "assistant-photo-migration-audit.js"),
      ).href
    ),
    import(
      pathToFileURL(path.join(assistantDist, "assistant-v1-photo-catalog.js"))
        .href
    ),
    import(pathToFileURL(searchDist).href),
  ]);

  const report = await runPlaceMediaCoverageAudit({
    baseUrl,
    audit: auditAssistantPhotoMigrationCoverage,
    legacyEntries: listAssistantV1PhotoCatalogEntries(),
    legacyPlaceNames: search.morroV1SearchCatalog.map((entry) => entry.name),
  });

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  runCli().catch(() => {
    process.stderr.write("PLACE_MEDIA_COVERAGE_REPORT_FAILED\n");
    process.exitCode = 1;
  });
}
