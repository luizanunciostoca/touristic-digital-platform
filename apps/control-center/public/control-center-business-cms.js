export const businessCmsContract = Object.freeze({
  list: "/businesses/cms",
  detail: (businessId) => `/businesses/${encodeURIComponent(businessId)}/cms`,
  create: "/businesses/cms",
  updateProfile: (businessId) =>
    `/businesses/${encodeURIComponent(businessId)}/cms/profile`,
  publish: (businessId) =>
    `/businesses/${encodeURIComponent(businessId)}/cms/publication`,
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
            ${option("pending", "Pendente", model.filters?.locationStatus)}
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
        <p>Busca interna → provider externo → confirmação explícita.</p>
        <div class="module-list">
          <div class="module-row"><span>Endereço</span><strong>${escapeHtml(location.address ?? "—")}</strong></div>
          <div class="module-row"><span>Coordenadas</span><strong>${escapeHtml(location.latitude ?? "—")}, ${escapeHtml(location.longitude ?? "—")}</strong></div>
          <div class="module-row"><span>Fonte</span><strong>${escapeHtml(location.source ?? "—")}</strong></div>
        </div>
      </section>`,
    ],
    [
      "media",
      "Fotos e mídia",
      `<section class="card section-card">
        <h2>Fotos e mídia</h2>
        <p>Upload, cover, gallery, logo, reorder e delete são delegados ao contrato de Media.</p>
        <strong>${escapeHtml(media.count ?? safeArray(media.assets).length)} ativo(s)</strong>
      </section>`,
    ],
    [
      "catalog",
      "Produtos",
      `<section class="card section-card">
        <h2>Produtos, ofertas e cardápio</h2>
        <div class="module-list">
          <div class="module-row"><span>Produtos</span><strong>${escapeHtml(catalog.productCount ?? 0)}</strong></div>
          <div class="module-row"><span>Ofertas</span><strong>${escapeHtml(catalog.offerCount ?? 0)}</strong></div>
          <div class="module-row"><span>Menus</span><strong>${escapeHtml(catalog.menuCount ?? 0)}</strong></div>
        </div>
        <p>Valores e disponibilidade autoritativa permanecem em Commerce / Inventory / Ticketing.</p>
      </section>`,
    ],
    [
      "actions",
      "Ações no mapa",
      `<section class="card section-card">
        <h2>Ações no mapa</h2>
        <p>Automáticas: ${escapeHtml(safeArray(actions.automatic).length)} · Disponíveis: ${escapeHtml(safeArray(actions.available).length)} · Incompatíveis: ${escapeHtml(safeArray(actions.incompatible).length)}</p>
        <p>O Control Center não replica o resolver de CTA no browser.</p>
      </section>`,
    ],
    [
      "preview",
      "Preview",
      `<section class="card section-card">
        <h2>Preview público</h2>
        <div class="business-cms-preview">
          <div>
            <small>${escapeHtml(detail.preview?.locale ?? "pt-BR")}</small>
            <h3>${escapeHtml(detail.preview?.name ?? profile.name ?? detail.name ?? "Empresa")}</h3>
            <p>${escapeHtml(detail.preview?.description ?? profile.shortDescription ?? "")}</p>
          </div>
        </div>
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
        ${canMutate ? '<button class="primary-button" type="button" data-business-publish>Publicar alterações</button>' : ""}
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
        result.textContent = "Perfil salvo como revisão editável.";
      } catch (error) {
        result.textContent =
          error.body?.error ?? error.message ?? "Falha ao salvar perfil.";
      }
    });

  root
    .querySelector("[data-business-publish]")
    ?.addEventListener("click", async () => {
      const result = root.querySelector("#business-cms-publication-result");

      try {
        result.textContent = "Validando publicação…";
        await ctx.api(businessCmsContract.publish(detail.businessId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "publish" }),
        });
        result.textContent = "Publicação solicitada ao contrato governado.";
      } catch (error) {
        result.textContent =
          error.body?.error ?? error.message ?? "Publicação bloqueada.";
      }
    });
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
