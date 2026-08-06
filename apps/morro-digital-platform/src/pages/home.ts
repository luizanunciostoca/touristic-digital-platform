import { createAction, renderAction } from "@touristic/design-system";

export function renderHomePage(): string {
  const exploreAction = createAction({
    label: "Explorar Morro de São Paulo",
    ariaLabel: "Explorar atrações e empresas de Morro de São Paulo",
    variant: "primary",
    size: "lg",
  });

  return `<section class="morro-home" aria-labelledby="morro-home-title"><div class="morro-home__hero"><p class="morro-home__eyebrow">Seu guia digital da ilha</p><h2 id="morro-home-title" class="morro-home__title">Descubra Morro de São Paulo</h2><p class="morro-home__description">Encontre experiências, empresas, praias, eventos e rotas em uma única plataforma.</p>${renderAction(exploreAction)}</div><section class="morro-home__quick-access" aria-label="Acessos rápidos"><a href="/mapa">Abrir mapa</a><a href="/buscar">Buscar lugares</a><a href="/perfil">Meu perfil</a></section></section>`;
}
