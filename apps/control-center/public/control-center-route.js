export function parseControlCenterHash(hash = "", defaultView = "overview") {
  const raw = hash.replace(/^#/u, "");
  const queryIndex = raw.indexOf("?");
  const route = queryIndex < 0 ? raw : raw.slice(0, queryIndex);
  const query = queryIndex < 0 ? "" : raw.slice(queryIndex + 1);
  const [view, detail] = route.split(":", 2);
  return { view: view || defaultView, detail, query };
}
