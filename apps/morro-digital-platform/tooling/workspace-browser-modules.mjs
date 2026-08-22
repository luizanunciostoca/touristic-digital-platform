const workspaceModuleSpecifier =
  /(["'])@touristic\/([a-z0-9-]+)(\/[^"']+)?\1/gu;

export function rewriteWorkspaceModuleSpecifiers(source) {
  return source.replace(
    workspaceModuleSpecifier,
    (match, quote, packageName, subpath = "") => {
      const relativeEntry = subpath ? subpath.slice(1) : "index";
      const segments = relativeEntry.split("/");
      if (
        segments.some(
          (segment) =>
            !segment ||
            segment === "." ||
            segment === ".." ||
            !/^[A-Za-z0-9_-]+(?:\.js)?$/u.test(segment),
        )
      ) {
        return match;
      }
      const entry = relativeEntry.endsWith(".js")
        ? relativeEntry
        : `${relativeEntry}.js`;
      return `${quote}/packages/${packageName}/dist/${entry}${quote}`;
    },
  );
}
