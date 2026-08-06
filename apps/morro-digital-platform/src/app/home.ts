import {
  createAppShell,
  renderAppShell,
  tokens,
} from "@touristic/design-system";

const categoryCards = [
  { title: "Onde ficar", description: "Hotéis, pousadas e hospedagens." },
  { title: "Onde comer", description: "Restaurantes, bares e experiências." },
  { title: "O que fazer", description: "Passeios, praias e atividades." },
];

function renderCategories(): string {
  return `<section class="morro-home__categories" aria-labelledby="categories-title"><h2 id="categories-title">Explore Morro de São Paulo</h2><div class="morro-home__grid">${categoryCards
    .map(
      ({ title, description }) =>
        `<article class="morro-category-card"><h3>${title}</h3><p>${description}</p><a href="/categoria/${title.toLowerCase().replaceAll(" ", "-")}">Explorar</a></article>`,
    )
    .join("")}</div></section>`;
}

export function renderHome(): string {
  const shell = createAppShell({
    destinationId: "morro-de-sao-paulo",
    status: "success",
    header: {
      title: "Morro Digital",
      subtitle: "Seu guia inteligente em Morro de São Paulo",
      actions: [{ label: "Buscar", variant: "primary", ariaLabel: "Buscar" }],
    },
    navigation: {
      ariaLabel: "Navegação principal",
      orientation: "horizontal",
      items: [
        { id: "home", label: "Início", href: "/", active: true },
        { id: "map", label: "Mapa", href: "/mapa" },
        { id: "search", label: "Buscar", href: "/buscar" },
        { id: "assistant", label: "Assistente", href: "/assistente" },
      ],
    },
  });

  const content = `<section class="morro-home__hero"><p class="morro-home__eyebrow">Touristic Digital Platform V2</p><h2>Descubra o melhor da ilha.</h2><p>Encontre lugares, experiências e rotas em uma plataforma preparada para múltiplos destinos.</p><div class="morro-home__map-placeholder" role="img" aria-label="Prévia do mapa de Morro de São Paulo">Mapa interativo em migração</div></section>${renderCategories()}`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="theme-color" content="${tokens.color.brand}"><title>Morro Digital V2</title></head><body>${renderAppShell(shell, content)}</body></html>`;
}
