interface CommerceMoney {
  readonly minorUnits: number;
  readonly currency: string;
}

interface CommerceOffer {
  readonly id: string;
  readonly product?: { readonly kind?: string; readonly reference?: string };
  readonly label: string;
  readonly unitAmount: CommerceMoney;
  readonly startsAt: string;
  readonly availableQuantity: number;
}

function money(value: CommerceMoney): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: value.currency,
  }).format(value.minorUnits / 100);
}

function date(value: string): string {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Bahia",
      }).format(parsed)
    : "Data a confirmar";
}

function kind(value?: string): string {
  return value === "tour" ? "Passeio" : "Experiência";
}

function offerCard(document: Document, offer: CommerceOffer): HTMLElement {
  const article = document.createElement("article");
  article.className = "home-commerce-card";

  const eyebrow = document.createElement("span");
  eyebrow.className = "home-commerce-kind";
  eyebrow.textContent = kind(offer.product?.kind);

  const title = document.createElement("h3");
  title.textContent = offer.label;

  const schedule = document.createElement("p");
  schedule.textContent = date(offer.startsAt);

  const meta = document.createElement("div");
  meta.className = "home-commerce-card-meta";
  const price = document.createElement("strong");
  price.textContent = money(offer.unitAmount);
  const availability = document.createElement("span");
  availability.textContent = `${offer.availableQuantity} disponíveis`;
  meta.append(price, availability);

  const actions = document.createElement("div");
  actions.className = "home-commerce-card-actions";
  const detail = document.createElement("a");
  detail.href = `/experience.html?id=${encodeURIComponent(offer.id)}`;
  detail.textContent = "Detalhes";
  const reserve = document.createElement("a");
  reserve.className = "primary";
  reserve.href = `/tickets.html?offer=${encodeURIComponent(offer.id)}`;
  reserve.textContent = offer.availableQuantity > 0 ? "Reservar" : "Ver oferta";
  actions.append(detail, reserve);

  article.append(eyebrow, title, schedule, meta, actions);
  return article;
}

export function installHomeCommerce({ document }: { readonly document: Document }): void {
  const shell = document.querySelector<HTMLElement>(".app-shell");
  if (!shell || document.getElementById("home-commerce")) return;

  const root = document.createElement("section");
  root.id = "home-commerce";
  root.className = "home-commerce";
  root.setAttribute("aria-label", "Ingressos, passeios e experiências");

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "home-commerce-toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "home-commerce-panel");
  toggle.innerHTML = '<span aria-hidden="true">🎟️</span><span>Ingressos e passeios</span>';

  const panel = document.createElement("div");
  panel.id = "home-commerce-panel";
  panel.className = "home-commerce-panel";
  panel.hidden = true;

  const header = document.createElement("div");
  header.className = "home-commerce-header";
  header.innerHTML = "<div><span>Marketplace Morro Digital</span><h2>Viva Morro</h2></div>";
  const all = document.createElement("a");
  all.href = "/tickets.html";
  all.textContent = "Ver tudo";
  header.append(all);

  const status = document.createElement("p");
  status.className = "home-commerce-status";
  status.setAttribute("role", "status");
  status.textContent = "Carregando experiências…";

  const grid = document.createElement("div");
  grid.className = "home-commerce-grid";
  panel.append(header, status, grid);
  root.append(toggle, panel);
  shell.append(root);

  toggle.addEventListener("click", () => {
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  });

  void fetch("/api/ticketing/v1/inventory", {
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || `HTTP_${response.status}`);
      return Array.isArray(payload.data) ? (payload.data as CommerceOffer[]) : [];
    })
    .then((offers) => {
      grid.replaceChildren();
      const available = offers.filter((offer) => offer.availableQuantity > 0).slice(0, 4);
      if (available.length === 0) {
        status.textContent = "Consulte o marketplace para próximas experiências.";
        return;
      }
      status.remove();
      for (const offer of available) grid.append(offerCard(document, offer));
    })
    .catch(() => {
      status.textContent = "Experiências temporariamente indisponíveis. Abra o marketplace para tentar novamente.";
    });
}
