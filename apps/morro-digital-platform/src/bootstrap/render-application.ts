import {
  createAppShell,
  renderAppShell,
} from "@touristic/design-system";

import { renderHomePage } from "../pages/home.js";
import { resolveRoute, routes } from "../router/routes.js";

export function renderApplication(pathname = "/"): string {
  const activeRoute = resolveRoute(pathname);
  const shell = createAppShell({
    destinationId: "morro-de-sao-paulo",
    status: "success",
    header: {
      title: "Morro Digital",
      subtitle: "Morro de São Paulo na palma da sua mão",
      ariaLabel: "Cabeçalho principal do Morro Digital",
    },
    navigation: {
      ariaLabel: "Navegação principal",
      orientation: "horizontal",
      items: routes.map((route) => ({
        id: route.id,
        label: route.title,
        href: route.path,
        active: route.id === activeRoute.id,
      })),
    },
  });

  const content =
    activeRoute.id === "home"
      ? renderHomePage()
      : `<section class="morro-placeholder" aria-labelledby="page-title"><h2 id="page-title">${activeRoute.title}</h2><p>Este módulo será migrado em uma próxima etapa da V2.</p></section>`;

  return renderAppShell(shell, content);
}
