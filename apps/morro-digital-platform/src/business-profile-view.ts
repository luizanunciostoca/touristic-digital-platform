import { normalizeBusinessProfile, type BusinessProfile } from "@touristic/business";

const STYLE_ID = "md-business-profile-view-styles";

export type BusinessProfileViewAction = "primary" | "map" | "promotion";

export interface BusinessProfileViewOptions {
  readonly onAction?: (action: BusinessProfileViewAction, profile: BusinessProfile) => void;
  readonly onClose?: (profile: BusinessProfile) => void;
}

export interface BusinessProfileViewHandle {
  readonly element: HTMLElement;
  readonly data: BusinessProfile;
  readonly close: () => void;
}

function injectStyles(document: Document): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.md-business-profile-backdrop{position:fixed;inset:0;z-index:100010;background:rgba(0,0,0,.58);display:grid;place-items:center;padding:18px}.md-business-profile{width:min(760px,100%);max-height:min(88vh,860px);overflow:auto;border-radius:24px;background:#fff;color:#12231d;box-shadow:0 28px 80px rgba(0,0,0,.42);font-family:Inter,system-ui,sans-serif}.md-business-profile-hero{min-height:180px;padding:22px;display:flex;align-items:flex-end;background:linear-gradient(135deg,#174936,#d4a84e);color:#fff;position:relative}.md-business-profile-close{position:absolute;right:14px;top:14px;border:0;border-radius:999px;width:40px;height:40px;background:rgba(0,0,0,.28);color:#fff;font-size:24px;cursor:pointer}.md-business-profile-badge{display:inline-flex;padding:5px 9px;border-radius:999px;background:#f5d88c;color:#173327;font-weight:900;font-size:11px}.md-business-profile-title{font-size:clamp(28px,6vw,44px);line-height:1.05;margin:10px 0 5px}.md-business-profile-body{padding:22px}.md-business-profile-meta{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;color:#52645d;font-size:14px}.md-business-profile-gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0}.md-business-profile-gallery-item{aspect-ratio:4/3;border-radius:14px;background:linear-gradient(135deg,#e7efe9,#c9d8cf);display:grid;place-items:center;color:#557067;font-size:13px;text-align:center;padding:10px}.md-business-profile-description{line-height:1.65;margin:0 0 18px}.md-business-profile-promotion{padding:16px;border-radius:16px;background:linear-gradient(135deg,#fff3c7,#f6d66e);color:#3d3213;margin:0 0 16px}.md-business-profile-promotion small{display:block;font-weight:900;text-transform:uppercase;margin-bottom:5px}.md-business-profile-promotion h3{margin:0 0 6px;font-size:18px}.md-business-profile-promotion p{margin:0 0 10px;font-size:13px;line-height:1.45}.md-business-profile-promotion button{border:0;border-radius:10px;padding:10px 13px;background:#173327;color:#fff;font-weight:900;cursor:pointer}.md-business-profile-notice{padding:12px 14px;border-radius:14px;background:#fff7df;color:#604b18;font-size:13px;margin-bottom:16px}.md-business-profile-actions{display:flex;gap:10px;flex-wrap:wrap}.md-business-profile-action{border:0;border-radius:12px;padding:12px 16px;font-weight:900;cursor:pointer;background:#164836;color:#fff}.md-business-profile-action.secondary{background:#edf3ef;color:#173327}@media(max-width:620px){.md-business-profile-backdrop{align-items:end;padding:0}.md-business-profile{border-radius:22px 22px 0 0;max-height:92vh}.md-business-profile-gallery{grid-template-columns:1fr 1fr}.md-business-profile-gallery-item:last-child{display:none}}`;
  document.head.append(style);
}

export function openBusinessProfileView(
  document: Document,
  profile: unknown,
  options: BusinessProfileViewOptions = {},
): BusinessProfileViewHandle {
  injectStyles(document);
  const data = normalizeBusinessProfile(profile);
  document
    .querySelectorAll<HTMLElement>('[data-business-profile-view="true"]')
    .forEach((node) => node.remove());

  const backdrop = document.createElement("div");
  backdrop.className = "md-business-profile-backdrop";
  backdrop.dataset.businessProfileView = "true";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.setAttribute("aria-label", `Perfil de ${data.name}`);

  const panel = document.createElement("article");
  panel.className = "md-business-profile";
  panel.innerHTML = `<header class="md-business-profile-hero"><button type="button" class="md-business-profile-close" aria-label="Fechar perfil">×</button><div><span class="md-business-profile-badge">${data.tutorial ? "PRÉVIA PERSONALIZADA" : "PARCEIRO MORRO DIGITAL"}</span><h2 class="md-business-profile-title"></h2><div class="md-business-profile-subtitle"></div></div></header><div class="md-business-profile-body"><div class="md-business-profile-meta"></div><div class="md-business-profile-gallery" aria-label="Galeria demonstrativa"><div class="md-business-profile-gallery-item">Imagem principal</div><div class="md-business-profile-gallery-item">Produtos ou serviços</div><div class="md-business-profile-gallery-item">Experiência do cliente</div></div><p class="md-business-profile-description"></p><div class="md-business-profile-promotion" hidden></div><div class="md-business-profile-notice"></div><div class="md-business-profile-actions"></div></div>`;

  const title = panel.querySelector<HTMLElement>(".md-business-profile-title");
  const subtitle = panel.querySelector<HTMLElement>(".md-business-profile-subtitle");
  const meta = panel.querySelector<HTMLElement>(".md-business-profile-meta");
  const description = panel.querySelector<HTMLElement>(".md-business-profile-description");
  if (!title || !subtitle || !meta || !description) throw new Error("INVALID_PROFILE_VIEW_TEMPLATE");
  title.textContent = data.name;
  subtitle.textContent = `${data.categoryLabel} · ${data.specialty}`;
  meta.textContent = data.locationLabel;
  description.textContent = data.description;

  const promotion = panel.querySelector<HTMLElement>(".md-business-profile-promotion");
  if (promotion && data.promotion) {
    promotion.hidden = false;
    promotion.innerHTML = '<small>Promoção ativa</small><h3></h3><p></p><button type="button"></button>';
    const promotionTitle = promotion.querySelector<HTMLElement>("h3");
    const promotionText = promotion.querySelector<HTMLElement>("p");
    const promotionButton = promotion.querySelector<HTMLButtonElement>("button");
    if (promotionTitle && promotionText && promotionButton) {
      promotionTitle.textContent = data.promotion.title;
      promotionText.textContent = data.promotion.description + (data.promotion.validUntil ? ` · válida até ${data.promotion.validUntil}` : "");
      promotionButton.textContent = data.promotion.cta;
      promotionButton.addEventListener("click", () => options.onAction?.("promotion", data));
    }
  }

  const notice = panel.querySelector<HTMLElement>(".md-business-profile-notice");
  if (notice) {
    notice.textContent = data.locationIsExample
      ? "A localização exibida é usada apenas como exemplo durante o tutorial. Horários, avaliações, imagens e contatos serão adicionados no cadastro definitivo."
      : "Horários, avaliações, imagens e contatos serão exibidos aqui após o cadastro definitivo.";
  }

  const actions = panel.querySelector<HTMLElement>(".md-business-profile-actions");
  if (!actions) throw new Error("INVALID_PROFILE_VIEW_ACTIONS");
  const primary = document.createElement("button");
  primary.type = "button";
  primary.className = "md-business-profile-action";
  primary.textContent = data.cta;
  primary.addEventListener("click", () => options.onAction?.("primary", data));
  actions.append(primary);
  const map = document.createElement("button");
  map.type = "button";
  map.className = "md-business-profile-action secondary";
  map.textContent = "Ver no mapa";
  map.addEventListener("click", () => options.onAction?.("map", data));
  actions.append(map);

  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && backdrop.isConnected) close();
  };
  const close = (): void => {
    document.removeEventListener("keydown", onKey);
    backdrop.remove();
    previousFocus?.focus();
    options.onClose?.(data);
  };
  const closeButton = panel.querySelector<HTMLButtonElement>(".md-business-profile-close");
  if (!closeButton) throw new Error("INVALID_PROFILE_VIEW_CLOSE");
  closeButton.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener("keydown", onKey);
  backdrop.append(panel);
  document.body.append(backdrop);
  closeButton.focus();

  return Object.freeze({ element: backdrop, data, close });
}
