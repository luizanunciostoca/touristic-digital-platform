export const businessCmsContract = Object.freeze({
  list: "/businesses/cms",
  detail: (businessId) => `/businesses/${encodeURIComponent(businessId)}/cms`,
  create: "/businesses/cms",
  updateProfile: (businessId) =>
    `/businesses/${encodeURIComponent(businessId)}/cms/profile`,
  updateLocation: (businessId) =>
    `/businesses/${encodeURIComponent(businessId)}/cms/location`,
  publish: (businessId) =>
    `/businesses/${encodeURIComponent(businessId)}/cms/publication`,
  catalogDraft: (businessId, kind) =>
    `/businesses/${encodeURIComponent(businessId)}/cms/catalog/${encodeURIComponent(kind)}`,
});

let businessCmsRuntimeUnavailable = false;

const lifecycleLabels = Object.freeze({
  draft: "Draft",
  review: "Ready",
  ready: "Ready",
  published: "Published",
  suspended: "Suspended",
  archived: "Archived",
});

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function statusLabel(value) {
  return lifecycleLabels[String(value ?? "").toLowerCase()] ?? value ?? "Draft";
}

function isCmsContractUnavailable(error) {
  return (
    [404, 405, 501].includes(error?.status) ||
    [
      "BUSINESS_ADMIN_ROUTE_NOT_ALLOWED",
      "BUSINESS_ADMIN_ROUTE_NOT_AVAILABLE",
      "DOMAIN_ADMIN_CONTRACT_NOT_REGISTERED",
      "BUSINESS_ADMIN_CONTRACT_REQUIRED",
      "PLACE_PLATFORM_UNAVAILABLE",
    ].includes(error?.body?.error)
  );
}

function option(value, label, current) {
  const selected = String(current ?? "") === value ? "selected" : "";
  return `<option value="${value}" ${selected}>${label}</option>`;
}

function filterMarkup(model, escapeHtml) {
  const destinations = safeArray(model.destinations);
  const categories = safeArray(model.categories);

  return `
    <section class="card section-card business-cms-toolbar">
      <form id="business-cms-filter-form" class="business-cms-filter-grid">
        <label>
          Busca
          <input
            name="query"
            type="search"
            autocomplete="off"
            placeholder="Nome, Business ID ou Place ID"
            value="${escapeHtml(model.filters?.query ?? "")}"
          />
        </label>
        <label>
          Destino
          <select name="destinationId">
            <option value="">Todos</option>
            ${destinations
              .map((entry) =>
                option(
                  String(entry.id),
                  escapeHtml(entry.name ?? entry.id),
                  model.filters?.destinationId,
                ),
              )
              .join("")}
          </select>
        </label>
        <label>
          Categoria
          <select name="categoryId">
            <option value="">Todas</option>
            ${categories
              .map((entry) =>
                option(
                  String(entry.id),
                  escapeHtml(entry.name ?? entry.key ?? entry.id),
                  model.filters?.categoryId,
                ),
              )
              .join("")}
          </select>
        </label>
        <label>
          Publicação
          <select name="publicationState">
            <option value="">Todos</option>
            ${["draft", "review", "published", "suspended", "archived"]
              .map((value) =>
                option(
                  value,
                  statusLabel(value),
                  model.filters?.publicationState,
                ),
              )
              .join("")}
          </select>
        </label>
        <label>
          Localização
          <select name="locationStatus">
            <option value="">Todas</option>
            ${option("confirmed", "Confirmada", model.filters?.locationStatus)}
            ${option(
              "missing",
              "Sem localização",
              model.filters?.locationStatus,
            )}
          </select>
        </label>
        <div class="business-cms-toolbar-actions">
          <button class="secondary-button" type="submit">Aplicar filtros</button>
          <button class="primary-button" type="button" data-business-cms-new>
            + Nova empresa
          </button>
        </div>
      </form>
    </section>`;
}

function businessRows(model, escapeHtml) {
  const rows = safeArray(model.businesses);
  if (!rows.length) {
    return '<tr><td colspan="7" class="empty">Nenhuma empresa encontrada.</td></tr>';
  }

  return rows
    .map((entry) => {
      const businessId = entry.businessId ?? entry.id;
      return `
        <tr>
          <td>
            <a href="#businesses:${encodeURIComponent(businessId)}">
              <strong>${escapeHtml(entry.name ?? businessId)}</strong>
            </a>
            <br />
            <small>${escapeHtml(businessId)}</small>
          </td>
          <td>${escapeHtml(entry.destinationName ?? entry.destinationId ?? "—")}</td>
          <td>${escapeHtml(entry.categoryName ?? entry.categoryId ?? "—")}</td>
          <td><span class="badge">${escapeHtml(statusLabel(entry.publicationState))}</span></td>
          <td>${escapeHtml(entry.locationStatus ?? (entry.placeId ? "confirmed" : "missing"))}</td>
          <td>${escapeHtml(entry.productCount ?? 0)} / ${escapeHtml(entry.offerCount ?? 0)}</td>
          <td><a href="#businesses:${encodeURIComponent(businessId)}">Administrar</a></td>
        </tr>`;
    })
    .join("");
}

function wizardMarkup(model, escapeHtml) {
  const destinations = safeArray(model.destinations);
  const categories = safeArray(model.categories);

  return `
    <dialog id="business-cms-wizard" class="business-cms-dialog">
      <form method="dialog" id="business-cms-create-form">
        <div class="section-title">
          <div>
            <small>CREATE BUSINESS WIZARD</small>
            <h2>Nova empresa</h2>
          </div>
          <button class="secondary-button" value="cancel">Fechar</button>
        </div>
        <ol class="business-cms-steps" aria-label="Etapas do cadastro">
          <li>Identidade</li>
          <li>Categoria</li>
          <li>Destination</li>
          <li>Localização</li>
          <li>Perfil</li>
          <li>Fotos</li>
          <li>Recursos</li>
          <li>Produtos</li>
          <li>Ações</li>
          <li>Preview</li>
          <li>Publicação</li>
        </ol>
        <div class="form-grid">
          <label>Nome<input required name="name" autocomplete="organization" /></label>
          <label>Business ID<input name="businessId" /></label>
          <label>
            Categoria
            <select required name="categoryId">
              <option value="">Selecione</option>
              ${categories
                .map((entry) =>
                  option(
                    String(entry.id),
                    escapeHtml(entry.name ?? entry.key ?? entry.id),
                    "",
                  ),
                )
                .join("")}
            </select>
          </label>
          <label>
            Destino
            <select required name="destinationId">
              <option value="">Selecione</option>
              ${destinations
                .map((entry) =>
                  option(
                    String(entry.id),
                    escapeHtml(entry.name ?? entry.id),
                    "",
                  ),
                )
                .join("")}
            </select>
          </label>
          <label>
            Descrição curta
            <textarea name="shortDescription" rows="3"></textarea>
          </label>
          <label>Contato principal<input name="contact" /></label>
        </div>
        <p class="business-cms-contract-note">
          Localização, mídia, produtos, ofertas, menu, ações e publicação usam
          os contratos das waves proprietárias.
        </p>
        <div class="business-cms-dialog-actions">
          <button class="secondary-button" value="cancel">Cancelar</button>
          <button class="primary-button" type="submit" value="default">
            Criar draft
          </button>
        </div>
        <p id="business-cms-create-result" role="status"></p>
      </form>
    </dialog>`;
}

function listMarkup(model, escapeHtml, canMutate) {
  return `
    <div class="callout">
      <strong>Business / Place CMS:</strong>
      identidades, localização, mídia, catálogo, ações e publicação são
      consumidos por contratos owner. O browser não infere tenant, não calcula
      autoridade financeira e não resolve CTA canônico.
    </div>
    ${filterMarkup(model, escapeHtml)}
    <div class="table-wrap" tabindex="0">
      <table>
        <thead>
          <tr>
            <th>Empresa</th>
            <th>Destino</th>
            <th>Categoria</th>
            <th>Publicação</th>
            <th>Localização</th>
            <th>Produtos / ofertas</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${businessRows(model, escapeHtml)}</tbody>
      </table>
    </div>
    ${canMutate ? wizardMarkup(model, escapeHtml) : ""}`;
}

function detailTabs(detail, escapeHtml, canMutate) {
  const profile = detail.profile ?? {};
  const location = detail.location ?? {};
  const media = detail.media ?? {};
  const catalog = detail.catalog ?? {};
  const products = safeArray(catalog.products);
  const offers = safeArray(catalog.offers);
  const menus = safeArray(catalog.menus);
  const menuCategories = safeArray(catalog.categories);
  const menuItems = safeArray(catalog.items);
  const actions = detail.actions ?? {};
  const publication = detail.publication ?? {};
  const team = safeArray(detail.team);
  const audit = safeArray(detail.audit);

  const panels = [
    [
      "overview",
      "Visão geral",
      `<div class="grid stats">
        <article class="card stat">
          <span class="stat-label">Publicação</span>
          <strong class="stat-value">${escapeHtml(statusLabel(publication.state ?? detail.publicationState))}</strong>
          <small>revision ${escapeHtml(publication.editableRevision ?? "—")}</small>
        </article>
        <article class="card stat">
          <span class="stat-label">Localização</span>
          <strong class="stat-value">${escapeHtml(location.status ?? "missing")}</strong>
          <small>${escapeHtml(detail.place?.placeId ?? detail.placeId ?? "sem Place")}</small>
        </article>
        <article class="card stat">
          <span class="stat-label">Mídia</span>
          <strong class="stat-value">${escapeHtml(media.count ?? safeArray(media.assets).length)}</strong>
          <small>ativos canônicos</small>
        </article>
        <article class="card stat">
          <span class="stat-label">Catálogo</span>
          <strong class="stat-value">${escapeHtml((catalog.productCount ?? 0) + (catalog.offerCount ?? 0))}</strong>
          <small>produtos + ofertas</small>
        </article>
      </div>`,
    ],
    [
      "profile",
      "Perfil",
      `<section class="card section-card">
        <h2>Perfil</h2>
        <form id="business-cms-profile-form" class="form-grid">
          <label>Nome<input name="name" value="${escapeHtml(profile.name ?? detail.name ?? "")}" ${canMutate ? "" : "disabled"} /></label>
          <label>Categoria<input name="categoryId" value="${escapeHtml(profile.categoryId ?? detail.categoryId ?? "")}" ${canMutate ? "" : "disabled"} /></label>
          <label>Descrição curta<textarea name="shortDescription" rows="3" ${canMutate ? "" : "disabled"}>${escapeHtml(profile.shortDescription ?? "")}</textarea></label>
          <label>Descrição completa<textarea name="description" rows="6" ${canMutate ? "" : "disabled"}>${escapeHtml(profile.description ?? "")}</textarea></label>
          <label>Tags<input name="tags" value="${escapeHtml(safeArray(profile.tags).join(", "))}" ${canMutate ? "" : "disabled"} /></label>
          <label>Amenities<input name="amenities" value="${escapeHtml(safeArray(profile.amenities).join(", "))}" ${canMutate ? "" : "disabled"} /></label>
          ${canMutate ? '<div><button class="primary-button" type="submit">Salvar perfil</button></div>' : ""}
        </form>
        <p id="business-cms-profile-result" role="status"></p>
      </section>`,
    ],
    [
      "location",
      "Localização",
      `<section class="card section-card">
        <h2>Localização</h2>
        <div class="module-list">
          <div class="module-row"><span>Endereço</span><strong>${escapeHtml(location.address ?? "—")}</strong></div>
          <div class="module-row"><span>Coordenadas</span><strong>${escapeHtml(location.latitude ?? "—")}, ${escapeHtml(location.longitude ?? "—")}</strong></div>
          <div class="module-row"><span>Fonte</span><strong>${escapeHtml(location.source ?? "—")}</strong></div>
        </div>
        ${
          canMutate
            ? `<form id="business-cms-location-form" class="form-grid">
                <label>Endereço<input name="address" value="${escapeHtml(location.address ?? "")}" maxlength="500" /></label>
                <label>Latitude<input required name="latitude" type="number" step="any" min="-90" max="90" value="${escapeHtml(location.latitude ?? "")}" /></label>
                <label>Longitude<input required name="longitude" type="number" step="any" min="-180" max="180" value="${escapeHtml(location.longitude ?? "")}" /></label>
                <div class="business-cms-inline-actions">
                  <button type="button" class="secondary-button" data-business-cms-position>Usar posição atual</button>
                  <button type="submit" class="primary-button">Confirmar localização</button>
                </div>
              </form>
              <p id="business-cms-location-result" role="status"></p>`
            : ""
        }
      </section>`,
    ],
    [
      "media",
      "Fotos e mídia",
      `<section class="card section-card">
        <h2>Fotos e mídia</h2>
        <strong>${escapeHtml(media.count ?? safeArray(media.assets).length)} ativo(s)</strong>
        <div class="module-list">
          ${
            safeArray(media.assets)
              .map(
                (entry) =>
                  `<div class="module-row"><span>${escapeHtml(entry.asset?.alt ?? entry.mediaId)}</span><strong>${escapeHtml(entry.role)} · ${escapeHtml(entry.asset?.publicationState ?? "indisponível")}</strong></div>`,
              )
              .join("") ||
            '<div class="empty">Nenhuma mídia associada a este Place.</div>'
          }
        </div>
        <p>Gerenciamento de arquivos requer o serviço de armazenamento Media.</p>
      </section>`,
    ],
    [
      "catalog",
      "Produtos",
      `<section class="card section-card">
        <h2>Produtos, ofertas e cardápio</h2>
        <div class="callout">
          <strong>Draft authoring:</strong> novos registros permanecem não públicos.
          Ativação/publicação do catálogo exige governança própria e não é feita por estes formulários.
        </div>
        <div class="grid stats">
          <article class="card stat"><span class="stat-label">Produtos</span><strong class="stat-value">${escapeHtml(catalog.productCount ?? products.length)}</strong></article>
          <article class="card stat"><span class="stat-label">Ofertas</span><strong class="stat-value">${escapeHtml(catalog.offerCount ?? offers.length)}</strong></article>
          <article class="card stat"><span class="stat-label">Menus</span><strong class="stat-value">${escapeHtml(catalog.menuCount ?? menus.length)}</strong></article>
        </div>
        <h3>Produtos</h3>
        <div class="module-list">
          ${products.map((entry) => `<div class="module-row"><span>${escapeHtml(entry.name)}<small>${escapeHtml(entry.id)}</small></span><strong>${escapeHtml(entry.status)}</strong></div>`).join("") || '<div class="empty">Nenhum produto cadastrado.</div>'}
        </div>
        <h3>Ofertas</h3>
        <div class="module-list">
          ${offers.map((entry) => `<div class="module-row"><span>${escapeHtml(entry.id)}<small>Product ${escapeHtml(entry.productId)}</small></span><strong>${escapeHtml(entry.status)} · ${escapeHtml(entry.price?.currency ?? "")} ${escapeHtml(((entry.price?.minorUnits ?? 0) / 100).toFixed(2))}</strong></div>`).join("") || '<div class="empty">Nenhuma oferta cadastrada.</div>'}
        </div>
        <h3>Cardápios</h3>
        <div class="module-list">
          ${menus.map((entry) => `<div class="module-row"><span>${escapeHtml(entry.name)}<small>${escapeHtml(entry.id)}</small></span><strong>${escapeHtml(entry.status)}</strong></div>`).join("") || '<div class="empty">Nenhum cardápio cadastrado.</div>'}
          ${menuCategories.map((entry) => `<div class="module-row"><span>↳ ${escapeHtml(entry.name)}</span><strong>categoria</strong></div>`).join("")}
          ${menuItems.map((entry) => `<div class="module-row"><span>↳ ${escapeHtml(entry.name)}</span><strong>item draft</strong></div>`).join("")}
        </div>
        ${
          canMutate
            ? `
          <div class="business-cms-catalog-forms">
            <form class="form-grid" data-business-catalog-kind="product">
              <h3>Novo produto</h3>
              <label>Nome<input required name="name" maxlength="180" /></label>
              <label>Descrição<textarea name="description" rows="3"></textarea></label>
              <label>Tags<input name="tags" placeholder="sunset, experiência" /></label>
              <button class="primary-button" type="submit">Criar product draft</button>
            </form>
            <form class="form-grid" data-business-catalog-kind="offer">
              <h3>Nova oferta</h3>
              <label>Produto<select required name="productId"><option value="">Selecione</option>${products.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.name)}</option>`).join("")}</select></label>
              <label>Preço (R$)<input required name="price" inputmode="decimal" placeholder="150,00" /></label>
              <label>Capacidade<input name="capacity" type="number" min="0" step="1" /></label>
              <button class="primary-button" type="submit" ${products.length ? "" : "disabled"}>Criar offer draft</button>
            </form>
            <form class="form-grid" data-business-catalog-kind="menu">
              <h3>Novo cardápio</h3>
              <label>Nome<input required name="name" maxlength="180" /></label>
              <label>Descrição<textarea name="description" rows="3"></textarea></label>
              <button class="primary-button" type="submit">Criar menu draft</button>
            </form>
            <form class="form-grid" data-business-catalog-kind="menu-category">
              <h3>Nova categoria</h3>
              <label>Menu<select required name="menuId"><option value="">Selecione</option>${menus.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.name)}</option>`).join("")}</select></label>
              <label>Nome<input required name="name" maxlength="180" /></label>
              <label>Ordem<input name="sortOrder" type="number" min="0" step="1" value="0" /></label>
              <button class="primary-button" type="submit" ${menus.length ? "" : "disabled"}>Criar categoria</button>
            </form>
            <form class="form-grid" data-business-catalog-kind="menu-item">
              <h3>Novo item</h3>
              <label>Menu<select required name="menuId"><option value="">Selecione</option>${menus.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.name)}</option>`).join("")}</select></label>
              <label>Categoria<select required name="categoryId"><option value="">Selecione</option>${menuCategories.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.name)}</option>`).join("")}</select></label>
              <label>Nome<input required name="name" maxlength="180" /></label>
              <label>Descrição<textarea name="description" rows="2"></textarea></label>
              <label>Preço (R$)<input required name="price" inputmode="decimal" placeholder="45,00" /></label>
              <label>Tags<input name="tags" /></label>
              <label>Alérgenos<input name="allergens" /></label>
              <label>Ordem<input name="sortOrder" type="number" min="0" step="1" value="0" /></label>
              <button class="primary-button" type="submit" ${menus.length && menuCategories.length ? "" : "disabled"}>Criar item draft</button>
            </form>
          </div>
          <p id="business-cms-catalog-result" role="status"></p>
        `
            : ""
        }
        <p>Valores transacionais e disponibilidade autoritativa permanecem em Inventory / Ticketing / Financial.</p>
      </section>`,
    ],
    [
      "actions",
      "Ações no mapa",
      `<section class="card section-card">
        <h2>Ações no mapa</h2>
        <div class="module-list">
          ${
            safeArray(actions.available)
              .map(
                (action) =>
                  `<div class="module-row"><span>${escapeHtml(action.label ?? action.id)}</span><strong>${escapeHtml(action.enabled === false ? "Indisponível" : "Disponível")}</strong></div>`,
              )
              .join("") ||
            '<div class="empty">Nenhuma ação disponível para os dados atuais.</div>'
          }
        </div>
        <p>As ações são projetadas pelo registry do servidor.</p>
      </section>`,
    ],
    [
      "preview",
      "Preview",
      `<section class="card section-card">
        <h2>Prévia da revisão editável</h2>
        <div class="business-cms-preview">
          <div>
            <small>${escapeHtml(detail.preview?.locale ?? "pt-BR")}</small>
            <h3>${escapeHtml(detail.preview?.name ?? profile.name ?? detail.name ?? "Empresa")}</h3>
            <p>${escapeHtml(detail.preview?.description ?? profile.shortDescription ?? "")}</p>
            <p>${escapeHtml(detail.preview?.categoryId ?? "")} · ${escapeHtml(detail.preview?.location?.address ?? "")}</p>
            <p>${escapeHtml(
              safeArray(actions.available)
                .map((action) => action.label ?? action.id)
                .join(" · "),
            )}</p>
          </div>
        </div>
        <p>A visualização publicada usa a última revisão aprovada; alterações neste draft aguardam publicação.</p>
      </section>`,
    ],
    [
      "team",
      "Equipe",
      `<section class="card section-card">
        <h2>Equipe</h2>
        <div class="module-list">
          ${
            team
              .map(
                (member) =>
                  `<div class="module-row"><span>${escapeHtml(member.email ?? member.id)}</span><strong>${escapeHtml(member.role ?? "")}</strong></div>`,
              )
              .join("") || '<div class="empty">Nenhum membro projetado.</div>'
          }
        </div>
      </section>`,
    ],
    [
      "audit",
      "Auditoria",
      `<section class="card section-card">
        <h2>Auditoria</h2>
        <div class="module-list">
          ${
            audit
              .slice(0, 30)
              .map(
                (entry) =>
                  `<div class="module-row"><span>${escapeHtml(entry.action)}</span><strong>${escapeHtml(entry.result ?? "")} · ${escapeHtml(entry.timestamp ?? "")}</strong></div>`,
              )
              .join("") ||
            '<div class="empty">Nenhum evento no recorte atual.</div>'
          }
        </div>
      </section>`,
    ],
    [
      "publication",
      "Publicação",
      `<section class="card section-card">
        <h2>Publicação</h2>
        <div class="module-list">
          <div class="module-row"><span>Estado</span><strong>${escapeHtml(statusLabel(publication.state ?? detail.publicationState))}</strong></div>
          <div class="module-row"><span>Published revision</span><strong>${escapeHtml(publication.publishedRevision ?? "—")}</strong></div>
          <div class="module-row"><span>Editable revision</span><strong>${escapeHtml(publication.editableRevision ?? "—")}</strong></div>
        </div>
        ${
          canMutate && publication.editableRevision
            ? `<div class="business-cms-inline-actions">
                <button class="secondary-button" type="button" data-business-publication="review" ${publication.state === "review" ? "disabled" : ""}>Solicitar revisão</button>
                <button class="primary-button" type="button" data-business-publication="publish" ${publication.state === "review" ? "" : "disabled"}>Publicar revisão</button>
              </div>`
            : ""
        }
        <p id="business-cms-publication-result" role="status"></p>
      </section>`,
    ],
  ];

  const buttons = panels
    .map(
      ([id, label], index) =>
        `<button type="button" class="secondary-button" role="tab" data-business-cms-tab="${id}" aria-selected="${index === 0 ? "true" : "false"}">${label}</button>`,
    )
    .join("");

  const bodies = panels
    .map(
      ([id, , html], index) =>
        `<div role="tabpanel" data-business-cms-panel="${id}" ${index === 0 ? "" : "hidden"}>${html}</div>`,
    )
    .join("");

  return `
    <div class="business-cms-detail-heading">
      <div>
        <a href="#businesses">← Empresas</a>
        <h2>${escapeHtml(profile.name ?? detail.name ?? detail.businessId)}</h2>
        <small>${escapeHtml(detail.businessId)}</small>
      </div>
      <span class="badge">${escapeHtml(statusLabel(publication.state ?? detail.publicationState))}</span>
    </div>
    <div class="business-cms-tabs" role="tablist" aria-label="Administração da empresa">
      ${buttons}
    </div>
    <div class="business-cms-panels">${bodies}</div>`;
}

function bindTabs(root) {
  const buttons = [...root.querySelectorAll("[data-business-cms-tab]")];

  for (const button of buttons) {
    button.addEventListener("click", () => {
      for (const candidate of buttons) {
        const selected = candidate === button;
        candidate.setAttribute("aria-selected", selected ? "true" : "false");
        candidate.tabIndex = selected ? 0 : -1;
        const panel = root.querySelector(
          `[data-business-cms-panel="${candidate.dataset.businessCmsTab}"]`,
        );
        if (panel) panel.hidden = !selected;
      }
    });
  }
}

function bindList(root, ctx, model) {
  root
    .querySelector("#business-cms-filter-form")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      const params = new URLSearchParams(new FormData(event.currentTarget));
      globalThis.location.hash = `businesses?${params.toString()}`;
    });

  const dialog = root.querySelector("#business-cms-wizard");
  root
    .querySelector("[data-business-cms-new]")
    ?.addEventListener("click", () => dialog?.showModal());

  root
    .querySelector("#business-cms-create-form")
    ?.addEventListener("submit", async (event) => {
      if (event.submitter?.value === "cancel") return;
      event.preventDefault();
      const result = root.querySelector("#business-cms-create-result");

      try {
        const body = Object.fromEntries(new FormData(event.currentTarget));
        result.textContent = "Criando draft…";
        const response = await ctx.api(businessCmsContract.create, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const businessId =
          response.businessId ?? response.data?.businessId ?? response.data?.id;
        result.textContent = "Draft criado.";
        if (businessId) {
          globalThis.location.hash = `businesses:${encodeURIComponent(businessId)}`;
        }
      } catch (error) {
        result.textContent =
          error.body?.error ?? error.message ?? "Falha ao criar empresa.";
      }
    });

  void model;
}

function bindDetail(root, ctx, detail) {
  bindTabs(root);

  const locationForm = root.querySelector("#business-cms-location-form");
  const locationResult = root.querySelector("#business-cms-location-result");
  root
    .querySelector("[data-business-cms-position]")
    ?.addEventListener("click", () => {
      if (!globalThis.navigator?.geolocation) {
        locationResult.textContent =
          "Posição atual indisponível neste dispositivo.";
        return;
      }
      locationResult.textContent = "Obtendo posição atual…";
      globalThis.navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          locationForm.elements.latitude.value = String(coords.latitude);
          locationForm.elements.longitude.value = String(coords.longitude);
          locationResult.textContent =
            "Posição preenchida. Confirme antes de salvar.";
        },
        () => {
          locationResult.textContent =
            "Posição indisponível. Informe as coordenadas manualmente.";
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });
  locationForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(locationForm));
      locationResult.textContent = "Confirmando localização…";
      await ctx.api(businessCmsContract.updateLocation(detail.businessId), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await renderBusinessCms(ctx, detail.businessId);
      ctx.content.querySelector('[data-business-cms-tab="location"]')?.click();
      ctx.content.querySelector("#business-cms-location-result").textContent =
        "Localização salva como revisão editável.";
    } catch (error) {
      locationResult.textContent =
        error.body?.error ?? error.message ?? "Falha ao salvar localização.";
    }
  });

  root
    .querySelector("#business-cms-profile-form")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const result = root.querySelector("#business-cms-profile-result");

      try {
        const body = Object.fromEntries(new FormData(event.currentTarget));
        result.textContent = "Salvando…";
        await ctx.api(businessCmsContract.updateProfile(detail.businessId), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        await renderBusinessCms(ctx, detail.businessId);
        ctx.content.querySelector('[data-business-cms-tab="profile"]')?.click();
        ctx.content.querySelector("#business-cms-profile-result").textContent =
          "Perfil salvo como revisão editável.";
      } catch (error) {
        result.textContent =
          error.body?.error ?? error.message ?? "Falha ao salvar perfil.";
      }
    });

  for (const form of root.querySelectorAll("[data-business-catalog-kind]")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const result = root.querySelector("#business-cms-catalog-result");
      const kind = form.dataset.businessCatalogKind;
      const body = Object.fromEntries(new FormData(form));
      if ("price" in body) {
        const normalized = String(body.price).replace(",", ".").trim();
        const amount = Number(normalized);
        if (!Number.isFinite(amount) || amount < 0) {
          result.textContent = "Preço inválido.";
          return;
        }
        body.minorUnits = Math.round(amount * 100);
        body.currency = "BRL";
        delete body.price;
      }
      try {
        result.textContent = "Salvando draft…";
        await ctx.api(
          businessCmsContract.catalogDraft(detail.businessId, kind),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        await renderBusinessCms(ctx, detail.businessId);
        ctx.content.querySelector('[data-business-cms-tab="catalog"]')?.click();
        ctx.content.querySelector("#business-cms-catalog-result").textContent =
          "Draft salvo no catálogo canônico.";
      } catch (error) {
        result.textContent =
          error.body?.error ?? error.message ?? "Falha ao salvar draft.";
      }
    });
  }

  for (const button of root.querySelectorAll("[data-business-publication]")) {
    button.addEventListener("click", async () => {
      const result = root.querySelector("#business-cms-publication-result");

      try {
        result.textContent = "Validando publicação…";
        await ctx.api(businessCmsContract.publish(detail.businessId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: button.dataset.businessPublication,
            expectedRevision: detail.publication.editableRevision,
          }),
        });
        await renderBusinessCms(ctx, detail.businessId);
        ctx.content
          .querySelector('[data-business-cms-tab="publication"]')
          ?.click();
      } catch (error) {
        result.textContent =
          error.body?.error ?? error.message ?? "Publicação bloqueada.";
      }
    });
  }
}

export async function renderBusinessCms(
  ctx,
  businessId,
  { legacyRender } = {},
) {
  const canMutate = ctx.actorHasCapability("business.update");

  if (businessCmsRuntimeUnavailable && legacyRender) {
    await legacyRender(businessId);
    return false;
  }

  if (!businessId) {
    const hashQuery = globalThis.location.hash.split("?", 2)[1] ?? "";
    const query = hashQuery ? `?${hashQuery}` : "";

    try {
      const model = await ctx.api(`${businessCmsContract.list}${query}`);
      businessCmsRuntimeUnavailable = false;
      ctx.content.innerHTML = listMarkup(model, ctx.escapeHtml, canMutate);
      bindList(ctx.content, ctx, model);
      return true;
    } catch (error) {
      if (isCmsContractUnavailable(error) && legacyRender) {
        if (error?.body?.error === "PLACE_PLATFORM_UNAVAILABLE") {
          businessCmsRuntimeUnavailable = true;
        }
        await legacyRender();
        const callout = document.createElement("div");
        callout.className = "callout";
        callout.innerHTML =
          "<strong>Business CMS aguardando composição:</strong> o diretório legado permanece disponível até o adapter canônico de Business/Place ser integrado.";
        ctx.content.prepend(callout);
        return false;
      }
      throw error;
    }
  }

  try {
    const detail = await ctx.api(businessCmsContract.detail(businessId));
    businessCmsRuntimeUnavailable = false;
    ctx.content.innerHTML =
      (ctx.supportEntityContext?.() ?? "") +
      detailTabs(detail, ctx.escapeHtml, canMutate);
    bindDetail(ctx.content, ctx, detail);
    return true;
  } catch (error) {
    if (isCmsContractUnavailable(error) && legacyRender) {
      if (error?.body?.error === "PLACE_PLATFORM_UNAVAILABLE") {
        businessCmsRuntimeUnavailable = true;
      }
      await legacyRender(businessId);
      const callout = document.createElement("div");
      callout.className = "callout";
      callout.innerHTML =
        "<strong>Modo compatibilidade:</strong> a visão 360º atual foi mantida porque o adapter canônico do Business CMS ainda não está composto.";
      ctx.content.prepend(callout);
      return false;
    }
    throw error;
  }
}
