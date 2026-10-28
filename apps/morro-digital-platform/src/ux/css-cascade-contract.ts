const PUBLIC_CSS = "/apps/morro-digital-platform/public/";
const HOME_CSS = PUBLIC_CSS + "dist/entry-css/home.css";
const FEATURE_CSS = PUBLIC_CSS + "dist/entry-css/features.css";
const VENDOR_CSS = new Set([
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css",
  "https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600&display=swap",
]);

/** Resolve supported static local links; effective browser cascade still needs runtime proof. */
export function resolveCssCascade(html: string, manifest?: unknown): string[] {
  const activeHtml = html
    .replace(/<!--[\s\S]*?-->/gu, "")
    .replace(
      /<(template|noscript|script|textarea|title)\b[^>]*>[\s\S]*?<\/\1>/giu,
      "",
    );
  if (/<style\b/iu.test(activeHtml))
    throw new Error("CSS_INLINE_STYLESHEET_UNSUPPORTED");
  const links =
    activeHtml.match(/<link\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/giu) ?? [];
  const attribute = (link: string, name: string): string | undefined =>
    [
      ...link.matchAll(
        /\s+([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu,
      ),
    ]
      .find((match) => match[1]?.toLowerCase() === name)
      ?.slice(2)
      .find((value) => value !== undefined);
  const styles = links.filter((link) =>
    (attribute(link, "rel") ?? "")
      .toLowerCase()
      .split(/\s+/u)
      .includes("stylesheet"),
  );
  const local: string[] = [];
  for (const link of styles) {
    const media = attribute(link, "media");
    if (
      attribute(link, "rel")?.toLowerCase() !== "stylesheet" ||
      /\sdisabled(?:\s|=|>)/iu.test(link) ||
      (media !== undefined && media !== "" && media.toLowerCase() !== "all")
    )
      throw new Error("CSS_STYLESHEET_CONDITION_UNSUPPORTED");
    const href = attribute(link, "href") ?? "";
    if (href.startsWith(PUBLIC_CSS)) local.push(href);
    else if (!VENDOR_CSS.has(href) || local.length > 0)
      throw new Error("CSS_UNRECOGNIZED_OR_LATE_VENDOR_STYLESHEET");
  }
  const entry = links.filter((link) =>
    /\sdata-entry-css(?:\s|=|>)/u.test(link),
  );
  if (entry.length === 0) {
    if (
      local.length === 0 ||
      local.some((href) => href.includes("/entry-css/"))
    ) {
      throw new Error("CSS_DIRECT_CASCADE_INVALID");
    }
    return local;
  }
  if (
    entry.length !== 1 ||
    local.length !== 1 ||
    local[0] !== HOME_CSS ||
    attribute(entry[0]!, "rel") !== "stylesheet" ||
    attribute(entry[0]!, "href") !== HOME_CSS ||
    attribute(entry[0]!, "data-feature-css") !== FEATURE_CSS
  ) {
    throw new Error("CSS_ENTRY_LINK_CONTRACT_INVALID");
  }
  if (!manifest || typeof manifest !== "object")
    throw new Error("CSS_MANIFEST_REQUIRED");
  const value = manifest as {
    version?: unknown;
    maxEntryBytes?: unknown;
    sources?: unknown;
  };
  if (
    value.version !== 1 ||
    value.maxEntryBytes !== 100000 ||
    !Array.isArray(value.sources) ||
    value.sources.length === 0
  ) {
    throw new Error("CSS_MANIFEST_INVALID");
  }
  const sources = value.sources.map((source: unknown) => {
    if (!source || typeof source !== "object")
      throw new Error("CSS_SOURCE_INVALID");
    const row = source as { file?: unknown; sha256?: unknown };
    if (
      typeof row.file !== "string" ||
      !/^apps\/morro-digital-platform\/public\/[a-zA-Z0-9._/-]+\.css$/u.test(
        row.file,
      ) ||
      row.file.split("/").includes("..") ||
      row.file.includes("/entry-css/") ||
      typeof row.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/u.test(row.sha256)
    ) {
      throw new Error("CSS_SOURCE_INVALID");
    }
    return "/" + row.file;
  });
  if (new Set(sources).size !== sources.length)
    throw new Error("CSS_SOURCE_DUPLICATE");
  return sources;
}
