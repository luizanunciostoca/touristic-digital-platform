import type { DashboardAuthClient } from "@touristic/auth-browser";
import {
  normalizeBusinessProfile,
  type BusinessProfile,
} from "@touristic/business";
import type {
  BusinessDashboardClient,
  MorroProCatalog,
  MorroProMedia,
} from "./business-dashboard-client.js";
import {
  openBusinessProfileView,
  type BusinessProfileViewAction,
} from "./business-profile-view.js";
import {
  createBusinessContextController,
  morroProModules,
  resolveMorroProModuleAccess,
  type BusinessContextController,
  type MorroProModule,
  type MorroProModuleAccess,
} from "./morro-pro-business-management.js";

export const businessDashboardViews = morroProModules;

export type BusinessDashboardView = MorroProModule;

export function requestedBusinessId(search: string): string | undefined {
  const value = new URLSearchParams(search).get("businessId")?.trim();
  return value || undefined;
}

export function patchBusinessProfile(
  current: BusinessProfile | null,
  businessId: string,
  input: {
    readonly name: string;
    readonly categoryLabel: string;
    readonly description: string;
  },
): BusinessProfile {
  return normalizeBusinessProfile(
    {
      ...(current ?? {}),
      id: current?.id || businessId,
      name: input.name,
      categoryLabel: input.categoryLabel,
      description: input.description,
    },
    businessId,
  );
}

export interface BusinessDashboardSurfaceOptions {
  readonly document: Document;
  readonly storage: Storage;
  readonly search: string;
  readonly dashboardClient: BusinessDashboardClient;
  readonly authClient: DashboardAuthClient;
}

function requiredElement<T extends HTMLElement>(
  document: Document,
  id: string,
): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`MISSING_DASHBOARD_ELEMENT:${id}`);
  return element as T;
}

function setText(document: Document, id: string, value: string): void {
  requiredElement(document, id).textContent = value || "—";
}

const moduleDescriptions: Readonly<Record<MorroProModule, string>> =
  Object.freeze({
    dashboard: "Visão geral do seu negócio na Morro Digital.",
    profile:
      "Edite os dados públicos do negócio usando o Business/Place canônico.",
    location:
      "Gerencie a localização conforme a política geográfica e de publicação.",
    photos:
      "Gerencie fotos vinculadas ao Place através da autoridade de mídia.",
    products:
      "Gerencie produtos vinculados explicitamente ao negócio e aos Places.",
    offers: "Crie e acompanhe ofertas autorizadas do negócio.",
    menu: "Gerencie cardápio estruturado quando esta capacidade estiver disponível.",
    reservations: "Acompanhe reservas quando habilitadas para este Place.",
    ticketing: "Acesse ticketing e check-in quando habilitados.",
    financial:
      "Consulte projeções financeiras autorizadas em modo somente leitura.",
    content: "Gerencie conteúdo conforme sua role e capabilities.",
    preview: "Visualize a presença pública antes da publicação governada.",
    team: "Gerencie o acesso da equipe dentro do escopo deste negócio.",
    settings:
      "Ajuste preferências do Morro Pro sem receber capacidades de plataforma.",
  });

function ensureMorroProPanels(document: Document): void {
  const profilePanel = document.querySelector<HTMLElement>(
    '[data-view-panel="settings"]',
  );
  if (profilePanel) profilePanel.dataset.viewPanel = "profile";

  const main = document.querySelector<HTMLElement>(".dashboard-main");
  if (!main) throw new Error("MISSING_DASHBOARD_MAIN");

  for (const moduleId of morroProModules) {
    if (document.querySelector(`[data-view-panel="${moduleId}"]`)) continue;
    const section = document.createElement("section");
    section.className = "view";
    section.dataset.viewPanel = moduleId;
    section.innerHTML = `
      <div class="empty-state">
        <h2></h2>
        <p></p>
      </div>
    `;
    const access = section.querySelector("h2");
    const description = section.querySelector("p");
    if (access) access.textContent = moduleId;
    if (description) description.textContent = moduleDescriptions[moduleId];
    main.append(section);
  }
}

function renderMorroProNavigation(
  document: Document,
  access: readonly MorroProModuleAccess[],
  activate: (view: BusinessDashboardView) => void,
): void {
  const nav = document.querySelector<HTMLElement>(".sidebar-nav");
  if (!nav) throw new Error("MISSING_DASHBOARD_NAV");
  nav.replaceChildren();
  for (const moduleAccess of access) {
    if (!moduleAccess.visible) continue;
    const button = document.createElement("button");
    button.className = "nav-item";
    button.type = "button";
    button.dataset.dashboardView = moduleAccess.id;
    button.textContent = moduleAccess.label;
    button.setAttribute(
      "aria-label",
      moduleAccess.mutable
        ? moduleAccess.label
        : `${moduleAccess.label} — somente leitura`,
    );
    button.addEventListener("click", () => activate(moduleAccess.id));
    nav.append(button);
  }
}

function dispatchProfileAction(
  document: Document,
  action: BusinessProfileViewAction,
  profile: BusinessProfile,
): void {
  document.defaultView?.dispatchEvent(
    new CustomEvent("businessProfileAction", {
      detail: Object.freeze({ action, profile }),
    }),
  );
}

function minorUnits(value: string): number {
  const normalized = Number(value.replace(",", "."));
  const minor = Math.round(normalized * 100);
  if (!Number.isSafeInteger(minor) || minor < 0)
    throw new Error("Valor inválido.");
  return minor;
}

function commaList(value: string): readonly string[] {
  return Object.freeze(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

function toLocalDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function money(price: { minorUnits: number; currency: string }): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: price.currency || "BRL",
  }).format(price.minorUnits / 100);
}

interface MediaSurface {
  readonly form: HTMLFormElement;
  readonly list: HTMLElement;
  readonly status: HTMLElement;
}

function createMediaSurface(document: Document): MediaSurface {
  const panel = document.querySelector<HTMLElement>('[data-view-panel="photos"]');
  if (!panel) throw new Error("MISSING_MEDIA_PANEL");
  panel.innerHTML = `
    <div class="settings-grid">
      <article class="panel-card">
        <span class="eyebrow">Mídia canônica</span>
        <h2>Fotos</h2>
        <p>Alterações ficam na revisão editável e só chegam ao público após publicação governada.</p>
        <form id="morro-pro-media-form">
          <label>Imagem<input name="file" type="file" accept="image/jpeg,image/png,image/webp,image/avif" required /></label>
          <label>Texto alternativo<input name="alt" maxlength="300" required /></label>
          <label>Função<select name="role">
            <option value="gallery">Galeria</option>
            <option value="cover">Capa</option>
            <option value="logo">Logo</option>
            <option value="menu">Menu</option>
            <option value="product">Produto</option>
            <option value="other">Outro</option>
          </select></label>
          <label><input name="published" type="checkbox" checked /> Incluir no próximo publish</label>
          <button class="button" type="submit">Enviar foto</button>
        </form>
        <p id="morro-pro-media-status" class="form-status" role="status"></p>
      </article>
      <article class="panel-card">
        <h2>Fotos cadastradas</h2>
        <div id="morro-pro-media-list" aria-live="polite"></div>
      </article>
    </div>`;
  return Object.freeze({
    form: requiredElement<HTMLFormElement>(document, "morro-pro-media-form"),
    list: requiredElement<HTMLElement>(document, "morro-pro-media-list"),
    status: requiredElement<HTMLElement>(document, "morro-pro-media-status"),
  });
}

function safeMediaSource(value: string | undefined): string {
  const source = String(value ?? "").trim();
  return source.startsWith("/media/") || source.startsWith("https://")
    ? source
    : "";
}

function renderMedia(
  surface: MediaSurface,
  media: MorroProMedia,
  mutable: boolean,
): void {
  surface.list.replaceChildren();
  if (!media.assets.length) {
    surface.list.textContent = "Nenhuma foto cadastrada.";
    return;
  }
  for (const [index, entry] of media.assets.entries()) {
    const row = document.createElement("div");
    row.className = "catalog-row";
    const source = safeMediaSource(entry.asset?.providerReference);
    const summary = document.createElement("span");
    if (source) {
      const image = document.createElement("img");
      image.src = source;
      image.alt = "";
      image.width = 72;
      image.height = 54;
      image.loading = "lazy";
      summary.append(image);
    }
    summary.append(
      document.createTextNode(
        `${entry.asset?.alt || entry.mediaId} · ${entry.role} · ${entry.asset?.publicationState || "indisponível"}`,
      ),
    );
    row.append(summary);
    if (mutable) {
      for (const [label, action, value] of [
        ["Capa", "role", "cover"],
        ["Logo", "role", "logo"],
        ["Galeria", "role", "gallery"],
        [
          entry.asset?.publicationState === "published"
            ? "Retirar do próximo publish"
            : "Incluir no próximo publish",
          "published",
          entry.asset?.publicationState === "published" ? "false" : "true",
        ],
        ["↑", "move", "up"],
        ["↓", "move", "down"],
        ["Excluir", "delete", "true"],
      ] as const) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button secondary";
        button.textContent = label;
        button.dataset.mediaAction = action;
        button.dataset.mediaValue = value;
        button.dataset.mediaId = entry.mediaId;
        if (action === "move") {
          button.disabled =
            (value === "up" && index === 0) ||
            (value === "down" && index === media.assets.length - 1);
        }
        row.append(button);
      }
    }
    surface.list.append(row);
  }
}

async function fileAsBase64(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const byte of buffer) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function imageDimensions(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

interface CatalogSurface {
  readonly productForm: HTMLFormElement;
  readonly offerForm: HTMLFormElement;
  readonly menuForm: HTMLFormElement;
  readonly categoryForm: HTMLFormElement;
  readonly itemForm: HTMLFormElement;
  readonly productList: HTMLElement;
  readonly offerList: HTMLElement;
  readonly menuList: HTMLElement;
  readonly categoryList: HTMLElement;
  readonly itemList: HTMLElement;
  readonly productStatus: HTMLElement;
  readonly offerStatus: HTMLElement;
  readonly menuStatus: HTMLElement;
}

function catalogPanel(
  document: Document,
  module: "products" | "offers" | "menu",
): HTMLElement {
  const panel = document.querySelector<HTMLElement>(
    `[data-view-panel="${module}"]`,
  );
  if (!panel) throw new Error(`MISSING_CATALOG_PANEL:${module}`);
  panel.replaceChildren();
  return panel;
}

function createCatalogSurface(document: Document): CatalogSurface {
  const products = catalogPanel(document, "products");
  products.innerHTML = `
    <div class="settings-grid">
      <article class="panel-card">
        <span class="eyebrow">Catálogo canônico</span>
        <h2>Produtos</h2>
        <p>Alterações ficam em revisão editável até a publicação governada.</p>
        <form id="morro-pro-product-form">
          <input type="hidden" name="editId" />
          <label>Nome<input name="name" maxlength="180" required /></label>
          <label>Descrição <textarea name="description" rows="3"></textarea></label>
          <label>Tags<input name="tags" placeholder="sunset, experiência" /></label>
          <label>Status<select name="status">
            <option value="draft">Draft</option><option value="active">Ativo</option>
            <option value="inactive">Inativo</option><option value="archived">Arquivado</option>
          </select></label>
          <button class="button" type="submit">Salvar produto</button>
          <button class="button secondary" type="reset">Novo</button>
          <p id="morro-pro-product-status" class="form-status" role="status"></p>
        </form>
      </article>
      <article class="panel-card"><h2>Produtos cadastrados</h2><div id="morro-pro-product-list" aria-live="polite"></div></article>
    </div>`;

  const offers = catalogPanel(document, "offers");
  offers.innerHTML = `
    <div class="settings-grid">
      <article class="panel-card">
        <span class="eyebrow">Catálogo canônico</span>
        <h2>Ofertas</h2>
        <p>Catálogo define a oferta pública; Ticketing continua autoridade de inventário/check-in.</p>
        <form id="morro-pro-catalog-offer-form">
          <input type="hidden" name="editId" />
          <label>Produto<select name="productId" required></select></label>
          <label>Preço (R$)<input name="price" inputmode="decimal" required /></label>
          <label>Moeda<input name="currency" maxlength="3" value="BRL" required /></label>
          <label>Capacidade<input name="capacity" type="number" min="0" step="1" /></label>
          <label>Início vendas<input name="salesStartsAt" type="datetime-local" /></label>
          <label>Fim vendas<input name="salesEndsAt" type="datetime-local" /></label>
          <label>Início experiência<input name="experienceStartsAt" type="datetime-local" /></label>
          <label>Fim experiência<input name="experienceEndsAt" type="datetime-local" /></label>
          <label>Status<select name="status">
            <option value="draft">Draft</option><option value="active">Ativa</option>
            <option value="paused">Pausada</option><option value="sold_out">Esgotada</option>
            <option value="expired">Expirada</option><option value="archived">Arquivada</option>
          </select></label>
          <button class="button" type="submit">Salvar oferta</button>
          <button class="button secondary" type="reset">Nova</button>
          <p id="morro-pro-catalog-offer-status" class="form-status" role="status"></p>
        </form>
      </article>
      <article class="panel-card"><h2>Ofertas cadastradas</h2><div id="morro-pro-catalog-offer-list" aria-live="polite"></div></article>
    </div>`;

  const menu = catalogPanel(document, "menu");
  menu.innerHTML = `
    <div class="settings-grid">
      <article class="panel-card">
        <span class="eyebrow">Catálogo canônico</span><h2>Cardápio</h2>
        <form id="morro-pro-menu-form">
          <input type="hidden" name="editId" />
          <label>Nome<input name="name" maxlength="180" required /></label>
          <label>Descrição <textarea name="description" rows="3"></textarea></label>
          <label>Status<select name="status">
            <option value="draft">Draft</option><option value="active">Ativo</option>
            <option value="inactive">Inativo</option><option value="archived">Arquivado</option>
          </select></label>
          <label>Media ID<input name="fallbackMediaId" maxlength="160" /></label>
          <label>Documento fallback<input name="fallbackDocumentUrl" maxlength="1000" /></label>
          <button class="button" type="submit">Salvar cardápio</button>
          <button class="button secondary" type="reset">Novo</button>
        </form>
        <div id="morro-pro-menu-list" aria-live="polite"></div>
      </article>
      <article class="panel-card">
        <h2>Categorias</h2>
        <form id="morro-pro-menu-category-form">
          <input type="hidden" name="editId" />
          <label>Menu<select name="menuId" required></select></label>
          <label>Nome<input name="name" maxlength="180" required /></label>
          <label>Ordem<input name="sortOrder" type="number" min="0" step="1" value="0" required /></label>
          <button class="button" type="submit">Salvar categoria</button>
          <button class="button secondary" type="reset">Nova</button>
        </form>
        <div id="morro-pro-menu-category-list" aria-live="polite"></div>
      </article>
      <article class="panel-card">
        <h2>Itens</h2>
        <form id="morro-pro-menu-item-form">
          <input type="hidden" name="editId" />
          <label>Menu<select name="menuId" required></select></label>
          <label>Categoria<select name="categoryId" required></select></label>
          <label>Nome<input name="name" maxlength="180" required /></label>
          <label>Descrição <textarea name="description" rows="2"></textarea></label>
          <label>Preço (R$)<input name="price" inputmode="decimal" required /></label>
          <label>Moeda<input name="currency" maxlength="3" value="BRL" required /></label>
          <label>Ordem<input name="sortOrder" type="number" min="0" step="1" value="0" required /></label>
          <label>Media ID<input name="mediaId" maxlength="160" /></label>
          <label>Tags<input name="tags" /></label>
          <label>Alérgenos<input name="allergens" /></label>
          <label><input name="available" type="checkbox" /> Disponível</label>
          <button class="button" type="submit">Salvar item</button>
          <button class="button secondary" type="reset">Novo</button>
        </form>
        <div id="morro-pro-menu-item-list" aria-live="polite"></div>
        <p id="morro-pro-menu-status" class="form-status" role="status"></p>
      </article>
    </div>`;

  return Object.freeze({
    productForm: requiredElement<HTMLFormElement>(
      document,
      "morro-pro-product-form",
    ),
    offerForm: requiredElement<HTMLFormElement>(
      document,
      "morro-pro-catalog-offer-form",
    ),
    menuForm: requiredElement<HTMLFormElement>(document, "morro-pro-menu-form"),
    categoryForm: requiredElement<HTMLFormElement>(
      document,
      "morro-pro-menu-category-form",
    ),
    itemForm: requiredElement<HTMLFormElement>(
      document,
      "morro-pro-menu-item-form",
    ),
    productList: requiredElement(document, "morro-pro-product-list"),
    offerList: requiredElement(document, "morro-pro-catalog-offer-list"),
    menuList: requiredElement(document, "morro-pro-menu-list"),
    categoryList: requiredElement(document, "morro-pro-menu-category-list"),
    itemList: requiredElement(document, "morro-pro-menu-item-list"),
    productStatus: requiredElement(document, "morro-pro-product-status"),
    offerStatus: requiredElement(document, "morro-pro-catalog-offer-status"),
    menuStatus: requiredElement(document, "morro-pro-menu-status"),
  });
}

function formControl(
  form: HTMLFormElement,
  name: string,
): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  const field = form.elements.namedItem(name);
  if (
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement ||
    field instanceof HTMLSelectElement
  )
    return field;
  throw new Error(`MISSING_FORM_FIELD:${name}`);
}

function setFormValue(
  form: HTMLFormElement,
  name: string,
  value: string | number | null | undefined,
): void {
  formControl(form, name).value = value == null ? "" : String(value);
}

function editId(form: HTMLFormElement): string {
  return formControl(form, "editId").value;
}

function resetEdit(form: HTMLFormElement): void {
  form.reset();
  setFormValue(form, "editId", "");
}

function selectOptions(
  document: Document,
  select: HTMLSelectElement,
  entries: readonly { id: string; name: string }[],
  placeholder: string,
): void {
  const current = select.value;
  select.replaceChildren();
  const first = document.createElement("option");
  first.value = "";
  first.textContent = placeholder;
  select.append(first);
  for (const entry of entries) {
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = entry.name;
    select.append(option);
  }
  if (
    Array.from(select.options).some((candidate) => candidate.value === current)
  )
    select.value = current;
}

function entryCard(
  document: Document,
  titleText: string,
  metaText: string,
  id: string,
  onEdit: () => void,
): HTMLElement {
  const article = document.createElement("article");
  article.className = "panel-card";
  const title = document.createElement("h3");
  title.textContent = titleText;
  const meta = document.createElement("p");
  meta.textContent = metaText;
  const small = document.createElement("small");
  small.textContent = id;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button secondary";
  button.textContent = "Editar";
  button.addEventListener("click", onEdit);
  article.append(title, meta, small, button);
  return article;
}

function renderCatalog(
  document: Document,
  surface: CatalogSurface,
  catalog: MorroProCatalog,
): void {
  const productSelect = formControl(
    surface.offerForm,
    "productId",
  ) as HTMLSelectElement;
  const categoryMenuSelect = formControl(
    surface.categoryForm,
    "menuId",
  ) as HTMLSelectElement;
  const itemMenuSelect = formControl(
    surface.itemForm,
    "menuId",
  ) as HTMLSelectElement;
  const itemCategorySelect = formControl(
    surface.itemForm,
    "categoryId",
  ) as HTMLSelectElement;
  selectOptions(
    document,
    productSelect,
    catalog.products,
    "Selecione um produto",
  );
  selectOptions(
    document,
    categoryMenuSelect,
    catalog.menus,
    "Selecione um menu",
  );
  selectOptions(document, itemMenuSelect, catalog.menus, "Selecione um menu");
  selectOptions(
    document,
    itemCategorySelect,
    catalog.categories,
    "Selecione uma categoria",
  );

  surface.productList.replaceChildren();
  for (const product of catalog.products) {
    surface.productList.append(
      entryCard(document, product.name, product.status, product.id, () => {
        setFormValue(surface.productForm, "editId", product.id);
        setFormValue(surface.productForm, "name", product.name);
        setFormValue(surface.productForm, "description", product.description);
        setFormValue(surface.productForm, "tags", product.tags.join(", "));
        setFormValue(surface.productForm, "status", product.status);
      }),
    );
  }

  surface.offerList.replaceChildren();
  for (const offer of catalog.offers) {
    const product = catalog.products.find(
      (entry) => entry.id === offer.productId,
    );
    surface.offerList.append(
      entryCard(
        document,
        product?.name ?? offer.productId,
        `${money(offer.price)} · ${offer.status}`,
        offer.id,
        () => {
          setFormValue(surface.offerForm, "editId", offer.id);
          setFormValue(surface.offerForm, "productId", offer.productId);
          setFormValue(
            surface.offerForm,
            "price",
            offer.price.minorUnits / 100,
          );
          setFormValue(surface.offerForm, "currency", offer.price.currency);
          setFormValue(surface.offerForm, "capacity", offer.capacity);
          setFormValue(
            surface.offerForm,
            "salesStartsAt",
            toLocalDateTime(offer.salesStartsAt),
          );
          setFormValue(
            surface.offerForm,
            "salesEndsAt",
            toLocalDateTime(offer.salesEndsAt),
          );
          setFormValue(
            surface.offerForm,
            "experienceStartsAt",
            toLocalDateTime(offer.experienceStartsAt),
          );
          setFormValue(
            surface.offerForm,
            "experienceEndsAt",
            toLocalDateTime(offer.experienceEndsAt),
          );
          setFormValue(surface.offerForm, "status", offer.status);
        },
      ),
    );
  }

  surface.menuList.replaceChildren();
  for (const menu of catalog.menus) {
    surface.menuList.append(
      entryCard(document, menu.name, menu.status, menu.id, () => {
        setFormValue(surface.menuForm, "editId", menu.id);
        setFormValue(surface.menuForm, "name", menu.name);
        setFormValue(surface.menuForm, "description", menu.description);
        setFormValue(surface.menuForm, "status", menu.status);
        setFormValue(surface.menuForm, "fallbackMediaId", menu.fallbackMediaId);
        setFormValue(
          surface.menuForm,
          "fallbackDocumentUrl",
          menu.fallbackDocumentUrl,
        );
      }),
    );
  }

  surface.categoryList.replaceChildren();
  for (const category of catalog.categories) {
    surface.categoryList.append(
      entryCard(
        document,
        category.name,
        `Ordem ${category.sortOrder}`,
        category.id,
        () => {
          setFormValue(surface.categoryForm, "editId", category.id);
          setFormValue(surface.categoryForm, "menuId", category.menuId);
          setFormValue(surface.categoryForm, "name", category.name);
          setFormValue(surface.categoryForm, "sortOrder", category.sortOrder);
        },
      ),
    );
  }

  surface.itemList.replaceChildren();
  for (const item of catalog.items) {
    surface.itemList.append(
      entryCard(
        document,
        item.name,
        `${money(item.price)} · ${item.available ? "disponível" : "indisponível"}`,
        item.id,
        () => {
          setFormValue(surface.itemForm, "editId", item.id);
          setFormValue(surface.itemForm, "menuId", item.menuId);
          setFormValue(surface.itemForm, "categoryId", item.categoryId);
          setFormValue(surface.itemForm, "name", item.name);
          setFormValue(surface.itemForm, "description", item.description);
          setFormValue(surface.itemForm, "price", item.price.minorUnits / 100);
          setFormValue(surface.itemForm, "currency", item.price.currency);
          setFormValue(surface.itemForm, "sortOrder", item.sortOrder);
          setFormValue(surface.itemForm, "mediaId", item.mediaId);
          setFormValue(surface.itemForm, "tags", item.tags.join(", "));
          setFormValue(
            surface.itemForm,
            "allergens",
            item.allergens.join(", "),
          );
          const available = surface.itemForm.elements.namedItem("available");
          if (available instanceof HTMLInputElement)
            available.checked = item.available;
        },
      ),
    );
  }
}
export async function mountBusinessDashboardSurface(
  options: BusinessDashboardSurfaceOptions,
): Promise<void> {
  const { document, storage, search, dashboardClient, authClient } = options;
  const entryScreen = requiredElement<HTMLElement>(document, "search-screen");
  const mainDashboard = requiredElement<HTMLElement>(
    document,
    "main-dashboard",
  );
  const entryMessage = requiredElement<HTMLElement>(document, "entry-message");
  const sidebar = requiredElement<HTMLElement>(document, "dashboard-sidebar");
  const overlay = requiredElement<HTMLElement>(document, "mobile-overlay");
  const form = requiredElement<HTMLFormElement>(document, "profile-form");
  const status = requiredElement<HTMLElement>(document, "profile-status");
  const nameInput = requiredElement<HTMLInputElement>(document, "profile-name");
  const categoryInput = requiredElement<HTMLInputElement>(
    document,
    "profile-category",
  );
  const descriptionInput = requiredElement<HTMLTextAreaElement>(
    document,
    "profile-description",
  );
  ensureMorroProPanels(document);
  const catalogSurface = createCatalogSurface(document);
  const mediaSurface = createMediaSurface(document);

  let activeProfile: BusinessProfile | null = null;
  let activeMedia: MorroProMedia = Object.freeze({
    count: 0,
    storageAvailable: false,
    assets: Object.freeze([]),
  });
  let activeCatalog: MorroProCatalog = Object.freeze({
    products: Object.freeze([]),
    offers: Object.freeze([]),
    menus: Object.freeze([]),
    categories: Object.freeze([]),
    items: Object.freeze([]),
  });
  let businessId = "";
  let contextController: BusinessContextController | null = null;

  function closeMobileMenu(): void {
    sidebar.classList.remove("mobile-open");
    overlay.hidden = true;
  }

  function activateView(view: BusinessDashboardView): void {
    document
      .querySelectorAll<HTMLElement>("[data-view-panel]")
      .forEach((panel) => {
        panel.classList.toggle("active", panel.dataset.viewPanel === view);
      });
    document
      .querySelectorAll<HTMLElement>("[data-dashboard-view]")
      .forEach((button) => {
        button.classList.toggle(
          "active",
          button.dataset.dashboardView === view,
        );
      });
    closeMobileMenu();
  }

  function renderProfile(profile: BusinessProfile | null): void {
    activeProfile = profile;
    const safeProfile =
      profile ?? normalizeBusinessProfile({ id: businessId }, businessId);
    setText(document, "business-name", safeProfile.name);
    setText(document, "summary-name", safeProfile.name);
    setText(document, "summary-category", safeProfile.categoryLabel);
    setText(document, "summary-description", safeProfile.description);
    nameInput.value = safeProfile.name;
    categoryInput.value = safeProfile.categoryLabel;
    descriptionInput.value = safeProfile.description;
  }

  async function reloadMedia(signal?: AbortSignal): Promise<void> {
    if (!businessId) return;
    const request = contextController?.request();
    const targetBusinessId = request?.businessId ?? businessId;
    const media = await dashboardClient.loadMedia(targetBusinessId, signal);
    if (request && !contextController?.isCurrent(request)) return;
    activeMedia = media;
    const mutable =
      mediaSurface.form.dataset.mutable === "true" && media.storageAvailable;
    renderMedia(mediaSurface, media, mutable);
    if (!media.storageAvailable) {
      mediaSurface.status.textContent =
        "Upload indisponível: armazenamento Media não configurado.";
    }
  }

  async function reloadCatalog(signal?: AbortSignal): Promise<void> {
    if (!businessId) return;
    const request = contextController?.request();
    const targetBusinessId = request?.businessId ?? businessId;
    const catalog = await dashboardClient.loadCatalog(targetBusinessId, signal);
    if (request && !contextController?.isCurrent(request)) return;
    activeCatalog = catalog;
    renderCatalog(document, catalogSurface, catalog);
  }

  async function submitCatalogMutation(
    kind: "product" | "offer" | "menu" | "menu-category" | "menu-item",
    form: HTMLFormElement,
    statusElement: HTMLElement,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const request = contextController?.request();
    const targetBusinessId = request?.businessId ?? businessId;
    const id = editId(form);
    form.setAttribute("aria-busy", "true");
    statusElement.textContent = id ? "Salvando alteração…" : "Criando draft…";
    try {
      if (id) {
        await dashboardClient.updateCatalogEntry(
          targetBusinessId,
          kind,
          id,
          payload,
        );
      } else {
        await dashboardClient.createCatalogEntry(
          targetBusinessId,
          kind,
          payload,
        );
      }
      if (request && !contextController?.isCurrent(request)) return;
      await reloadCatalog(request?.signal);
      if (request && !contextController?.isCurrent(request)) return;
      resetEdit(form);
      statusElement.textContent =
        "Alteração salva. A presença pública só muda após publicação governada.";
    } catch (error: unknown) {
      if (request && !contextController?.isCurrent(request)) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      statusElement.textContent =
        error instanceof Error ? error.message : "Falha ao salvar catálogo.";
    } finally {
      form.removeAttribute("aria-busy");
    }
  }

  mediaSurface.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const fileControl = mediaSurface.form.elements.namedItem("file");
    const file =
      fileControl instanceof HTMLInputElement ? fileControl.files?.[0] : null;
    if (!file) return;
    const request = contextController?.request();
    const targetBusinessId = request?.businessId ?? businessId;
    mediaSurface.form.setAttribute("aria-busy", "true");
    mediaSurface.status.textContent = "Preparando foto…";
    void (async () => {
      try {
        const dimensions = await imageDimensions(file);
        const dataBase64 = await fileAsBase64(file);
        const alt = formControl(mediaSurface.form, "alt").value;
        const role = formControl(mediaSurface.form, "role").value as
          | "cover"
          | "gallery"
          | "logo"
          | "menu"
          | "product"
          | "other";
        const published = mediaSurface.form.elements.namedItem("published");
        await dashboardClient.uploadMedia(targetBusinessId, {
          fileName: file.name,
          mimeType: file.type,
          width: dimensions.width,
          height: dimensions.height,
          alt,
          role,
          published:
            published instanceof HTMLInputElement ? published.checked : false,
          dataBase64,
        });
        if (request && !contextController?.isCurrent(request)) return;
        mediaSurface.form.reset();
        await reloadMedia(request?.signal);
        mediaSurface.status.textContent =
          "Foto salva. A presença pública só muda após publicação governada.";
      } catch (error: unknown) {
        if (request && !contextController?.isCurrent(request)) return;
        mediaSurface.status.textContent =
          error instanceof Error ? error.message : "Falha ao salvar foto.";
      } finally {
        mediaSurface.form.removeAttribute("aria-busy");
      }
    })();
  });

  mediaSurface.list.addEventListener("click", (event) => {
    const button =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>("[data-media-action]")
        : null;
    if (!button?.dataset.mediaId || !button.dataset.mediaAction) return;
    const request = contextController?.request();
    const targetBusinessId = request?.businessId ?? businessId;
    const mediaId = button.dataset.mediaId;
    const action = button.dataset.mediaAction;
    const value = button.dataset.mediaValue;
    mediaSurface.status.textContent = "Salvando foto…";
    void (async () => {
      try {
        if (action === "delete") {
          await dashboardClient.deleteMedia(targetBusinessId, mediaId);
        } else if (action === "move") {
          const ids = activeMedia.assets.map((entry) => entry.mediaId);
          const index = ids.indexOf(mediaId);
          const target = value === "up" ? index - 1 : index + 1;
          if (index < 0 || target < 0 || target >= ids.length) return;
          [ids[index], ids[target]] = [ids[target]!, ids[index]!];
          await dashboardClient.reorderMedia(targetBusinessId, ids);
        } else if (action === "role") {
          await dashboardClient.updateMedia(targetBusinessId, mediaId, {
            role: value,
          });
        } else if (action === "published") {
          await dashboardClient.updateMedia(targetBusinessId, mediaId, {
            published: value === "true",
          });
        }
        if (request && !contextController?.isCurrent(request)) return;
        await reloadMedia(request?.signal);
        mediaSurface.status.textContent =
          "Foto atualizada na revisão editável.";
      } catch (error: unknown) {
        if (request && !contextController?.isCurrent(request)) return;
        mediaSurface.status.textContent =
          error instanceof Error ? error.message : "Falha ao atualizar foto.";
      }
    })();
  });

  catalogSurface.productForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitCatalogMutation(
      "product",
      catalogSurface.productForm,
      catalogSurface.productStatus,
      {
        name: formControl(catalogSurface.productForm, "name").value,
        description: formControl(catalogSurface.productForm, "description")
          .value,
        tags: commaList(formControl(catalogSurface.productForm, "tags").value),
        status: formControl(catalogSurface.productForm, "status").value,
      },
    );
  });

  catalogSurface.offerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const starts = (name: string) => {
      const value = formControl(catalogSurface.offerForm, name).value;
      return value ? new Date(value).toISOString() : null;
    };
    void submitCatalogMutation(
      "offer",
      catalogSurface.offerForm,
      catalogSurface.offerStatus,
      {
        productId: formControl(catalogSurface.offerForm, "productId").value,
        minorUnits: minorUnits(
          formControl(catalogSurface.offerForm, "price").value,
        ),
        currency: formControl(catalogSurface.offerForm, "currency")
          .value.trim()
          .toUpperCase(),
        capacity: formControl(catalogSurface.offerForm, "capacity").value
          ? Number(formControl(catalogSurface.offerForm, "capacity").value)
          : null,
        salesStartsAt: starts("salesStartsAt"),
        salesEndsAt: starts("salesEndsAt"),
        experienceStartsAt: starts("experienceStartsAt"),
        experienceEndsAt: starts("experienceEndsAt"),
        status: formControl(catalogSurface.offerForm, "status").value,
      },
    );
  });

  catalogSurface.menuForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitCatalogMutation(
      "menu",
      catalogSurface.menuForm,
      catalogSurface.menuStatus,
      {
        name: formControl(catalogSurface.menuForm, "name").value,
        description: formControl(catalogSurface.menuForm, "description").value,
        status: formControl(catalogSurface.menuForm, "status").value,
        fallbackMediaId:
          formControl(catalogSurface.menuForm, "fallbackMediaId").value || null,
        fallbackDocumentUrl:
          formControl(catalogSurface.menuForm, "fallbackDocumentUrl").value ||
          null,
      },
    );
  });

  catalogSurface.categoryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitCatalogMutation(
      "menu-category",
      catalogSurface.categoryForm,
      catalogSurface.menuStatus,
      {
        menuId: formControl(catalogSurface.categoryForm, "menuId").value,
        name: formControl(catalogSurface.categoryForm, "name").value,
        sortOrder: Number(
          formControl(catalogSurface.categoryForm, "sortOrder").value,
        ),
      },
    );
  });

  catalogSurface.itemForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const available = catalogSurface.itemForm.elements.namedItem("available");
    void submitCatalogMutation(
      "menu-item",
      catalogSurface.itemForm,
      catalogSurface.menuStatus,
      {
        menuId: formControl(catalogSurface.itemForm, "menuId").value,
        categoryId: formControl(catalogSurface.itemForm, "categoryId").value,
        name: formControl(catalogSurface.itemForm, "name").value,
        description: formControl(catalogSurface.itemForm, "description").value,
        minorUnits: minorUnits(
          formControl(catalogSurface.itemForm, "price").value,
        ),
        currency: formControl(catalogSurface.itemForm, "currency")
          .value.trim()
          .toUpperCase(),
        sortOrder: Number(
          formControl(catalogSurface.itemForm, "sortOrder").value,
        ),
        mediaId: formControl(catalogSurface.itemForm, "mediaId").value || null,
        available:
          available instanceof HTMLInputElement ? available.checked : false,
        tags: commaList(formControl(catalogSurface.itemForm, "tags").value),
        allergens: commaList(
          formControl(catalogSurface.itemForm, "allergens").value,
        ),
      },
    );
  });

  for (const form of [
    catalogSurface.productForm,
    catalogSurface.offerForm,
    catalogSurface.menuForm,
    catalogSurface.categoryForm,
    catalogSurface.itemForm,
  ]) {
    form.addEventListener("reset", () => {
      queueMicrotask(() => resetEdit(form));
    });
  }

  const profileSummary = requiredElement<HTMLElement>(
    document,
    "summary-description",
  ).closest(".panel-card");
  if (!profileSummary) throw new Error("MISSING_PROFILE_SUMMARY_PANEL");
  const previewButton = document.createElement("button");
  previewButton.id = "open-business-profile";
  previewButton.type = "button";
  previewButton.className = "button secondary";
  previewButton.textContent = "Visualizar perfil";
  previewButton.addEventListener("click", () => {
    if (!activeProfile) return;
    openBusinessProfileView(document, activeProfile, {
      onAction: (action, profile) =>
        dispatchProfileAction(document, action, profile),
    });
  });
  profileSummary.append(previewButton);

  requiredElement<HTMLButtonElement>(document, "mobile-menu").addEventListener(
    "click",
    () => {
      sidebar.classList.add("mobile-open");
      overlay.hidden = false;
    },
  );
  overlay.addEventListener("click", closeMobileMenu);

  requiredElement<HTMLButtonElement>(
    document,
    "sidebar-collapse",
  ).addEventListener("click", () => sidebar.classList.toggle("collapsed"));

  const storedTheme = storage.getItem("business-dashboard-theme");
  if (storedTheme === "dark") document.documentElement.dataset.theme = "dark";
  requiredElement<HTMLButtonElement>(document, "theme-toggle").addEventListener(
    "click",
    () => {
      const next =
        document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      storage.setItem("business-dashboard-theme", next);
    },
  );

  requiredElement<HTMLButtonElement>(
    document,
    "logout-button",
  ).addEventListener("click", () => {
    void authClient.logout();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    status.textContent = "Salvando…";
    const nextProfile = patchBusinessProfile(activeProfile, businessId, {
      name: nameInput.value,
      categoryLabel: categoryInput.value,
      description: descriptionInput.value,
    });
    const request = contextController?.request();
    const targetBusinessId = request?.businessId ?? businessId;
    void dashboardClient
      .saveProfile(targetBusinessId, nextProfile)
      .then((saved) => {
        if (request && !contextController?.isCurrent(request)) return;
        renderProfile(saved);
        status.textContent = "Perfil salvo com segurança.";
      })
      .catch((error: unknown) => {
        if (request && !contextController?.isCurrent(request)) return;
        status.textContent =
          error instanceof Error ? error.message : "Falha ao salvar perfil.";
      });
  });

  try {
    const bootstrap = await dashboardClient.bootstrap(
      requestedBusinessId(search),
    );
    businessId = bootstrap.businessId;
    contextController = createBusinessContextController(
      bootstrap.session,
      businessId,
    );

    renderProfile(bootstrap.profile);
    const access = resolveMorroProModuleAccess(
      bootstrap.session.user.role,
      bootstrap.session.user.capabilities,
      [],
    );
    const accessByModule = new Map(
      access.map((item) => [item.id, item] as const),
    );
    const profileAccess = accessByModule.get("profile");
    if (!profileAccess?.mutable) {
      form
        .querySelectorAll<
          HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement
        >("input, textarea, button[type=submit]")
        .forEach((control) => {
          control.disabled = true;
        });
      status.textContent = "Seu acesso ao perfil é somente leitura.";
    }
    const photoAccess = accessByModule.get("photos");
    mediaSurface.form.dataset.mutable = String(photoAccess?.mutable === true);
    if (!photoAccess?.mutable) {
      mediaSurface.form
        .querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
          "input, select, button",
        )
        .forEach((control) => {
          control.disabled = true;
        });
      mediaSurface.status.textContent =
        photoAccess?.visible === true
          ? "Seu acesso a Fotos é somente leitura."
          : "";
    }

    for (const [moduleId, forms, statusElement] of [
      ["products", [catalogSurface.productForm], catalogSurface.productStatus],
      ["offers", [catalogSurface.offerForm], catalogSurface.offerStatus],
      [
        "menu",
        [
          catalogSurface.menuForm,
          catalogSurface.categoryForm,
          catalogSurface.itemForm,
        ],
        catalogSurface.menuStatus,
      ],
    ] as const) {
      const moduleAccess = accessByModule.get(moduleId);
      if (moduleAccess?.mutable) continue;
      for (const catalogForm of forms) {
        catalogForm
          .querySelectorAll<
            | HTMLInputElement
            | HTMLTextAreaElement
            | HTMLSelectElement
            | HTMLButtonElement
          >("input, textarea, select, button")
          .forEach((control) => {
            control.disabled = true;
          });
      }
      statusElement.textContent =
        moduleAccess?.visible === true
          ? "Seu acesso a este módulo é somente leitura."
          : "";
    }

    const activateAuthorizedView = (view: BusinessDashboardView): void => {
      const moduleAccess = accessByModule.get(view);
      if (!moduleAccess?.visible) return;
      activateView(view);
      if (view === "photos") {
        const request = contextController?.request();
        void reloadMedia(request?.signal).catch((error: unknown) => {
          if (request && !contextController?.isCurrent(request)) return;
          if (error instanceof DOMException && error.name === "AbortError") return;
          mediaSurface.status.textContent =
            error instanceof Error ? error.message : "Falha ao carregar fotos.";
        });
      }
      if (view === "products" || view === "offers" || view === "menu") {
        const request = contextController?.request();
        void reloadCatalog(request?.signal).catch((error: unknown) => {
          if (request && !contextController?.isCurrent(request)) return;
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          const statusElement =
            view === "products"
              ? catalogSurface.productStatus
              : view === "offers"
                ? catalogSurface.offerStatus
                : catalogSurface.menuStatus;
          statusElement.textContent =
            error instanceof Error
              ? error.message
              : "Falha ao carregar catálogo.";
        });
      }
    };

    renderMorroProNavigation(document, access, (view) => {
      activateAuthorizedView(view);
    });
    document
      .querySelectorAll<HTMLElement>("[data-dashboard-view]")
      .forEach((button) => {
        if (button.closest(".sidebar-nav")) return;
        const view = button.dataset.dashboardView as
          BusinessDashboardView | undefined;
        if (!view || !businessDashboardViews.includes(view)) return;
        const moduleAccess = accessByModule.get(view);
        if (!moduleAccess?.visible) {
          button.hidden = true;
          return;
        }
        button.addEventListener("click", () => activateAuthorizedView(view));
      });

    const scopes = contextController.scopes();
    if (scopes.length > 1) {
      const header = requiredElement<HTMLElement>(
        document,
        "business-name",
      ).parentElement;
      if (!header) throw new Error("MISSING_BUSINESS_HEADER");
      const label = document.createElement("label");
      label.className = "business-context";
      label.textContent = "Negócio";
      const selector = document.createElement("select");
      selector.id = "business-context-selector";
      selector.setAttribute("aria-label", "Selecionar negócio");
      for (const scope of scopes) {
        const option = document.createElement("option");
        option.value = scope;
        option.textContent = scope;
        option.selected = scope === businessId;
        selector.append(option);
      }
      selector.addEventListener("change", () => {
        try {
          const request = contextController?.switchTo(selector.value);
          if (!request) return;
          businessId = request.businessId;
          status.textContent = "Trocando contexto do negócio…";
          activeMedia = Object.freeze({
            count: 0,
            storageAvailable: false,
            assets: Object.freeze([]),
          });
          renderMedia(mediaSurface, activeMedia, false);
          mediaSurface.status.textContent = "";
          activeCatalog = Object.freeze({
            products: Object.freeze([]),
            offers: Object.freeze([]),
            menus: Object.freeze([]),
            categories: Object.freeze([]),
            items: Object.freeze([]),
          });
          renderCatalog(document, catalogSurface, activeCatalog);
          catalogSurface.productStatus.textContent = "";
          catalogSurface.offerStatus.textContent = "";
          catalogSurface.menuStatus.textContent = "";
          renderProfile(null);
          void dashboardClient
            .loadProfile(request.businessId, request.signal)
            .then(async (profile) => {
              if (!contextController?.isCurrent(request)) return;
              renderProfile(profile);
              const activeMediaPanel = document.querySelector<HTMLElement>(
                '[data-view-panel="photos"].active',
              );
              if (activeMediaPanel) {
                await reloadMedia(request.signal);
                if (!contextController?.isCurrent(request)) return;
              }
              const activeCatalogPanel = document.querySelector<HTMLElement>(
                '[data-view-panel="products"].active, [data-view-panel="offers"].active, [data-view-panel="menu"].active',
              );
              if (activeCatalogPanel) {
                await reloadCatalog(request.signal);
                if (!contextController?.isCurrent(request)) return;
              }
              status.textContent = "";
            })
            .catch((error: unknown) => {
              if (!contextController?.isCurrent(request)) return;
              if (
                error instanceof DOMException &&
                error.name === "AbortError"
              ) {
                return;
              }
              status.textContent =
                error instanceof Error
                  ? error.message
                  : "Falha ao trocar contexto do negócio.";
            });
        } catch (error: unknown) {
          selector.value = businessId;
          status.textContent =
            error instanceof Error ? error.message : "Negócio não autorizado.";
        }
      });
      label.append(selector);
      header.append(label);
    }

    entryScreen.hidden = true;
    mainDashboard.hidden = false;
    activateView("dashboard");
  } catch (error: unknown) {
    entryMessage.textContent =
      error instanceof Error
        ? `Não foi possível abrir o dashboard: ${error.message}`
        : "Não foi possível abrir o dashboard.";
    entryScreen.hidden = false;
    mainDashboard.hidden = true;
  }
}
