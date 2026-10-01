import { navigation, site } from "./content.mjs";

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const iconForTheme = (theme) => {
  if (theme === "morro") return "/assets/morro-symbol.svg";
  if (theme === "itacare") return "/assets/itacare-symbol.svg";
  return "/assets/tdp-symbol.svg";
};

const renderNavigation = (path) =>
  navigation
    .map(
      ([href, label]) =>
        `<a href="${href}"${path === href ? ' aria-current="page"' : ""}>${escapeHtml(label)}</a>`,
    )
    .join("");

const renderCtas = (ctas = []) => {
  if (!ctas.length) return "";
  return `<div class="hero__actions">${ctas
    .map(
      ([href, label], index) =>
        `<a class="button ${index === 0 ? "button--primary" : "button--secondary"}" href="${href}">${escapeHtml(label)}</a>`,
    )
    .join("")}</div>`;
};

const renderCards = (cards = []) => {
  if (!cards.length) return "";
  return `<div class="card-grid">${cards
    .map(([first, second, third]) => {
      const linked = String(first).startsWith("/");
      const heading = linked ? second : first;
      const label = linked ? null : second;
      const description = third;
      const body = `<article class="card">${label ? `<span class="card__kicker">${escapeHtml(heading)}</span><h3>${escapeHtml(label)}</h3>` : `<h3>${escapeHtml(heading)}</h3>`}<p>${escapeHtml(description)}</p>${linked ? `<a class="card__link" href="${first}">Abrir <span aria-hidden="true">→</span></a>` : ""}</article>`;
      return body;
    })
    .join("")}</div>`;
};

const renderMetrics = (metrics = []) => {
  if (!metrics.length) return "";
  return `<dl class="metric-grid">${metrics
    .map(
      ([value, label, qualifier]) =>
        `<div class="metric"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd><p>${escapeHtml(qualifier)}</p></div>`,
    )
    .join("")}</dl>`;
};

const renderResources = (resources = []) => {
  if (!resources.length) return "";
  return `<div class="resource-list">${resources
    .map(
      ([title, classification, description]) =>
        `<article class="resource"><div><span class="status status--neutral">${escapeHtml(classification)}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div><span class="resource__gate" aria-label="Download indisponível neste preview">Gate de publicação</span></article>`,
    )
    .join("")}</div>`;
};

const renderSection = (section, index) => `
<section class="section" aria-labelledby="section-${index}">
  <div class="section__intro">
    <span class="section__number" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
    <div>
      <h2 id="section-${index}">${escapeHtml(section.heading)}</h2>
      ${section.body ? `<p>${escapeHtml(section.body)}</p>` : ""}
      ${section.evidence ? `<p class="status-row"><span class="status">${escapeHtml(section.evidence)}</span></p>` : ""}
    </div>
  </div>
  ${renderCards(section.cards)}
  ${renderMetrics(section.metrics)}
  ${renderResources(section.resources)}
</section>`;

const structuredDataFor = (page) =>
  JSON.stringify({
    "@context": "https://schema.org",
    "@type": page.path === "/about/" ? "AboutPage" : "WebPage",
    name: page.title,
    description: page.description,
    inLanguage: site.language,
    isPartOf: {
      "@type": "WebSite",
      name: site.name,
    },
  }).replaceAll("<", "\\u003c");

export const renderPage = (page) => {
  const symbol = iconForTheme(page.theme);
  const themeClass = `theme--${page.theme}`;

  return `<!doctype html>
<html lang="${site.language}" class="${themeClass}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow,noarchive">
    <meta name="color-scheme" content="light">
    <title>${escapeHtml(page.title)}</title>
    <meta name="description" content="${escapeHtml(page.description)}">
    <link rel="stylesheet" href="/styles.css">
    <script type="application/ld+json">${structuredDataFor(page)}</script>
  </head>
  <body>
    <a class="skip-link" href="#main">Ir para o conteúdo</a>
    <div class="preview-banner" role="status">${escapeHtml(site.releaseState)}</div>
    <header class="site-header">
      <a class="brand" href="/" aria-label="Touristic Digital Platform — início">
        <img src="/assets/tdp-symbol.svg" alt="" width="48" height="48">
        <span><strong>Touristic Digital Platform</strong><small>REDE</small></span>
      </a>
      <nav class="primary-nav" aria-label="Navegação principal">
        ${renderNavigation(page.path)}
      </nav>
      <a class="header-link" href="/resources/">Recursos</a>
    </header>

    <main id="main">
      <section class="hero">
        <div class="hero__copy">
          <span class="eyebrow">${escapeHtml(page.eyebrow)}</span>
          <h1>${escapeHtml(page.heading)}</h1>
          <p class="hero__lede">${escapeHtml(page.lede)}</p>
          ${renderCtas(page.ctas)}
        </div>
        <div class="hero__visual" aria-hidden="true">
          <div class="route route--a"></div>
          <div class="route route--b"></div>
          <div class="node node--a"></div>
          <div class="node node--b"></div>
          <div class="node node--human"></div>
          <img src="${symbol}" alt="" width="176" height="176">
        </div>
      </section>

      <div class="page-shell">
        ${page.sections.map(renderSection).join("")}
      </div>

      <aside class="source-note" aria-label="Nota de autoridade">
        <span>Fonte / autoridade</span>
        <strong>${escapeHtml(page.source)}</strong>
        <p>Esta implementação preserva a baseline factual congelada e não representa autorização de publicação ou deployment em produção.</p>
      </aside>
    </main>

    <footer class="site-footer">
      <div>
        <img src="/assets/tdp-micro.svg" alt="" width="36" height="36">
        <p><strong>Touristic Digital Platform</strong><br>${escapeHtml(site.tagline)}</p>
      </div>
      <nav aria-label="Navegação institucional">
        <a href="/about/">Sobre</a>
        <a href="/investors/">Investidores</a>
        <a href="/sponsorship/">Sponsorship</a>
        <a href="/governance/">Governança</a>
        <a href="/resources/">Recursos</a>
        <a href="/contact/">Contato</a>
      </nav>
      <p class="site-footer__state">pt-BR master · Wave 3 preview · noindex</p>
    </footer>
  </body>
</html>`;
};
