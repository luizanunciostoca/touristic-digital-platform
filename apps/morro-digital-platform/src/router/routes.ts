export interface RouteDefinition {
  readonly id: string;
  readonly path: string;
  readonly title: string;
}

export const routes = Object.freeze([
  { id: "home", path: "/", title: "Início" },
  { id: "map", path: "/mapa", title: "Mapa" },
  { id: "search", path: "/buscar", title: "Buscar" },
  { id: "profile", path: "/perfil", title: "Perfil" },
] satisfies readonly RouteDefinition[]);

export function resolveRoute(pathname: string): RouteDefinition {
  const normalizedPath = pathname.trim() || "/";
  return routes.find((route) => route.path === normalizedPath) ?? routes[0];
}
