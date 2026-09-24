export const businessCmsContract = Object.freeze({
  list: "/businesses/cms",
  detail: (businessId) => `/businesses/${encodeURIComponent(businessId)}/cms`,
  create: "/businesses/cms",
  updateProfile: (businessId) =>
    `/businesses/${encodeURIComponent(businessId)}/cms/profile`,
  updateLocation: (businessId) =>
    `/businesses/${encodeURIComponent(businessId)}/cms/location`,
  media: (businessId) =>
    `/businesses/${encodeURIComponent(businessId)}/cms/media`,
  catalog: (businessId) =>
    `/businesses/${encodeURIComponent(businessId)}/cms/catalog`,
  actions: (businessId) =>
    `/businesses/${encodeURIComponent(businessId)}/cms/actions`,
  publish: (businessId) =>
    `/businesses/${encodeURIComponent(businessId)}/cms/publication`,
});

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

function option(value, label, current) {
  return `<option value="${value}" ${String(current ?? "") === value ? "selected" : ""}>${label}</option>`;
}

function sectionState(value, escapeHtml) {
  const normalized = value === true ? "available" : value || "pending";
  return `<span class="badge ${normalized === "available" ? "pass" : ""}">${escapeHtml(normalized)}</span>`;
}

function unavailableState(escapeHtml, message) {
  return `<section class="card section-card business-cms-empty">
    <div class="section-title"><h2>Contrato ainda não composto</h2><span class="badge">integration pending</span></div>
    <p>${escapeHtml(message)}</p>
  </section>`;
}

function filtersMarkup(model, escapeHtml) {
  const destinations = safeArray(model.destinations);
  const categories = safeArray(model.categories);
  return `
    <section class="card section-card business-cms-toolbar" aria-label="Filtros de empresas">
      <form id="business-cms-filter-form" class="business-cms-filter-grid">
        <label>Busca
          <input name="query" type="search" autocomplete="off" placeholder="Nome, Business ID ou Place ID" value="${escapeHtml(model.filters?.query ?? "")}" />
        </label>
        <label>Destino
          <select name="destinationId">
            <option value="">Todos</option>
            ${destinations.map((entry) => option(String(entry.id), escapeHtml(entry.name ?? entry.id), model.filters?.destinationId)).join("")}
          </select>
        </label>
        <label>Categoria
          <select name="categoryId">
            <option value="">Todas</option>
            ${categories.map((entry) => option(String(entry.id), escapeHtml(entry.name ?? entry.key ?? entry.id), model.filters?.categoryId)).join("")}
          </select>
        </label>
        <label>Publicação
          <select name="publicationState">
            <option value="">Todos</option>
            ${["draft","review","published","suspended","archived"].map((value) => option(value, statusLabel(value), model.filters?.publicationState)).join("")}
          </select>
        </label>
        <label>Localização
          <select name="locationStatus">
            <option value="">Todas</option>
            ${option("confirmed","Confirmada",model.filters?.locationStatus)}
            ${option("pending","Pendente",model.filters?.locationStatus)}
            ${option("missing","Sem localização",model.filters?.locationStatus)}
          </select>
        </label>
        <div class="business-cms-toolbar-actions">
          <button class="secondary-button" type="submit">Aplicar filtros</button>
          <button class="primary-button" type="button" data-business-cms-new>+ Nova empresa</button>
        </div>
      </form>
    </section>`;
}

function businessRows(model, escapeHtml) {
  const rows = safeArray(model.businesses);
  if (!rows.length) {
    return '<tr><td colspan="7" class="empty">Nenhuma empresa encontrada.</td></tr>';
  }
  return rows.map((entry) => `
    <tr>
      <td><a href="#businesses:${encodeURIComponent(entry.businessId ?? entry.id)}"><strong>${escapeHtml(entry.name ?? entry.businessId ?? entry.id)}</strong></a><br><small>${escapeHtml(entry.businessId ?? entry.id)}</small></td>
      <td>${escapeHtml(entry.destinationName ?? entry.destinationId ?? "—")}</td>
      <td>${escapeHtml(entry.categoryName ?? entry.categoryId ?? "—")}</td>
      <td><span class="badge">${escapeHtml(statusLabel(entry.publicationState))}</span></td>
      <td>${escapeHtml(entry.locationStatus ?? (entry.placeId ? "confirmed" : "missing"))}</td>
      <td>${escapeHtml(entry.productCount ?? 0)} / ${escapeHtml(entry.offerCount ?? 0)}</td>
      <td><a href="#businesses:${encodeURIComponent(entry.businessId ?? entry.id)}">Administrar</a></td>
    </tr>`).join("");
}

function listMarkup(model, escapeHtml, canMutate) {
  return `
    <div class="callout">
      <strong>Business / Place CMS:</strong>
      identidades, localização, mídia, catálogo, ações e publicação são consumidos por contratos owner.
      O browser não infere tenant, não calcula autoridade financeira e não resolve CTA canônico.
    </div>
    ${filtersMarkup(model, escapeHtml)}
    <div class="table-wrap" tabindex="0">
      <table>
        <thead><tr><th>Empresa</th><th>Destino</th><th>Categoria</th><th>Publicação</th><th>Localização</th><th>Produtos / ofertas</th><th></th></tr></thead>
        <tbody>${businessRows(model, escapeHtml)}</tbody>
      </table>
    </div>
    ${canMutate ? wizardMarkup(model, escapeHtml) : ""}`;
}

function wizardMarkup(model, escapeHtml) {
  const destinations = safeArray(model.destinations);
  const categories = safeArray(model.categories);
  return `
    <dialog id="business-cms-wizard" class="business-cms-dialog">
      <form method="dialog" id="business-cms-create-form">
        <div class="section-title">
          <div><small>CREATE BUSINESS WIZARD</small><h2>Nova empresa</h2></div>
          <button class="secondary-button" value="cancel" aria-label="Fechar">Fechar</button>
        </div>
        <ol class="business-cms-steps" aria-label="Etapas do cadastro">
          <li>Identidade</li><li>Categoria</li><li>Destination</li><li>Localização</li><li>Perfil</li><li>Fotos</li><li>Recursos</li><li>Produtos</li><li>Ações</li><li>Preview</li><li>Publicação</li>
        </ol>
        <div class="form-grid">
          <label>Nome<input required name="name" autocomplete="organization" /></label>
          <label>Business ID<input name="businessId" placeholder="gerado pelo owner quando vazio" /></label>
          <label>Categoria<select required name="categoryId"><option value="">Selecione</option>${categories.map((entry)=>option(String(entry.id),escapeHtml(entry.name ?? entry.key ?? entry.id),"")).join("")}</select></label>
          <label>Destino<select required name="destinationId"><option value="">Selecione</option>${destinations.map((entry)=>option(String(entry.id),escapeHtml(entry.name ?? entry.id),"")).join("")}</select></label>
          <label>Descrição curta<textarea name="shortDescription" rows="3"></textarea></label>
          <label>Contato principal<input name="contact" /></label>
        </div>
        <p class="business-cms-contract-note">Localização, mídia, produtos, ofertas, menu, ações e publicação continuam nas etapas administrativas após a criação e usam os contratos das waves proprietárias.</p>
        <div class="business-cms-dialog-actions">
          <button class="secondary-button" value="cancel">Cancelar</button>
          <button class="primary-button" type="submit" value="default">Criar draft</button>
        </div>
        <p id="business-cms-create-result" role="status"></p>
      </form>
    </dialog>`;
}

function summaryCards(detail, escapeHtml) {
  return `<div class="grid stats">
    <article class="card stat"><span class="stat-label">Publicação</span><strong class="stat-value">${escapeHtml(statusLabel(detail.publication?.state ?? detail.publicationState))}</strong><small>revision ${escapeHtml(detail.publication?.editableRevision ?? "—")}</small></article>
    <article class="card stat"><span class="stat-label">Localização</span><strong class="stat-value">${escapeHtml(detail.location?.status ?? (detail.place?.location ? "confirmed" : "missing"))}</strong><small>${escapeHtml(detail.place?.placeId ?? detail.placeId ?? "sem Place")}</small></article>
    <article class="card stat"><span class="stat-label">Mídia</span><strong class="stat-value">${escapeHtml(detail.media?.count ?? safeArray(detail.media?.assets).length)}</strong><small>ativos canônicos</small></article>
    <article class="card stat"><span class="stat-label">Catálogo</span><strong class="stat-value">${escapeHtml((detail.catalog?.productCount ?? 0) + (detail.catalog?.offerCount ?? 0))}</strong><small>produtos + ofertas</small></article>
  </div>`;
}

function profilePanel(detail, escapeHtml, canMutate) {
  const profile = detail.profile ?? {};
  return `<section class="card section-card">
    <div class="section-title"><h2>Perfil</h2>${sectionState(detail.capabilities?.profile ?? "available", escapeHtml)}</div>
    <form id="business-cms-profile-form" class="form-grid">
      <label>Nome<input name="name" value="${escapeHtml(profile.name ?? detail.name ?? "")}" ${canMutate ? "" : "disabled"} /></label>
      <label>Categoria<input name="categoryId" value="${escapeHtml(profile.categoryId ?? detail.categoryId ?? "")}" ${canMutate ? "" : "disabled"} /></label>
      <label>Subcategorias<input name="subcategoryIds" value="${escapeHtml(safeArray(profile.subcategoryIds).join(", "))}" ${canMutate ? "" : "disabled"} /></label>
      <label>Descrição curta<textarea name="shortDescription" rows="3" ${canMutate ? "" : "disabled"}>${escapeHtml(profile.shortDescription ?? "")}</textarea></label>
      <label>Descrição completa<textarea name="description" rows="6" ${canMutate ? "" : "disabled"}>${escapeHtml(profile.description ?? "")}</textarea></label>
      <label>Tags<input name="tags" value="${escapeHtml(safeArray(profile.tags).join(", "))}" ${canMutate ? "" : "disabled"} /></label>
      <label>Amenities<input name="amenities" value="${escapeHtml(safeArray(profile.amenities).join(", "))}" ${canMutate ? "" : "disabled"} /></label>
      <label>Visibilidade<input name="visibility" value="${escapeHtml(profile.visibility ?? detail.visibility ?? "")}" ${canMutate ? "" : "disabled"} /></label>
      ${canMutate ? '<div><button class="primary-button" type="submit">Salvar perfil</button></div>' : ""}
    </form>
    <p id="business-cms-profile-result" role="status"></p>
  </section>`;
}

function locationPanel(detail, escapeHtml, canMutate) {
  const location = detail.location ?? {};
  return `<section class="card section-card">
    <div class="section-title"><h2>Localização</h2>${sectionState(location.status, escapeHtml)}</div>
    <p>Busca interna → provider externo → confirmação explícita. Nenhum resultado é persistido automaticamente.</p>
    <div class="module-list">
      <div class="module-row"><span>Endereço</span><strong>${escapeHtml(location.address ?? "—")}</strong></div>
      <div class="module-row"><span>Coordenadas</span><strong>${escapeHtml(location.latitude ?? "—")}, ${escapeHtml(location.longitude ?? "—")}</strong></div>
      <div class="module-row"><span>Fonte</span><strong>${escapeHtml(location.source ?? "—")}</strong></div>
    </div>
    ${canMutate ? '<div class="business-cms-inline-actions"><button type="button" class="secondary-button" data-business-location-search>Buscar localização</button><button type="button" class="secondary-button" data-business-location-manual>Definir manualmente</button></div>' : ""}
  </section>`;
}

function mediaPanel(detail, escapeHtml, canMutate) {
  const media = detail.media ?? {};
  const assets = safeArray(media.assets);
  return `<section class="card section-card">
    <div class="section-title"><h2>Fotos e mídia</h2>${sectionState(media.status ?? "available", escapeHtml)}</div>
    <div class="business-cms-media-grid">
      ${assets.map((asset)=>`<article class="business-cms-media-card"><div><strong>${escapeHtml(asset.role ?? asset.type ?? "media")}</strong><br><small>${escapeHtml(asset.altText ?? asset.fileName ?? asset.id)}</small></div></article>`).join("") || '<div class="empty">Nenhuma mídia canônica disponível.</div>'}
    </div>
    ${canMutate ? '<div class="business-cms-inline-actions"><button type="button" class="secondary-button" data-business-media-upload>Upload</button><button type="button" class="secondary-button" data-business-media-reorder>Reordenar</button></div>' : ""}
  </section>`;
}

function catalogPanel(detail, escapeHtml) {
  const catalog = detail.catalog ?? {};
  return `<section class="card section-card">
    <div class="section-title"><h2>Produtos, ofertas e cardápio</h2>${sectionState(catalog.status ?? "available", escapeHtml)}</div>
    <div class="module-list">
      <div class="module-row"><span>Produtos</span><strong>${escapeHtml(catalog.productCount ?? safeArray(catalog.products).length)}</strong></div>
      <div class="module-row"><span>Ofertas</span><strong>${escapeHtml(catalog.offerCount ?? safeArray(catalog.offers).length)}</strong></div>
      <div class="module-row"><span>Menus</span><strong>${escapeHtml(catalog.menuCount ?? safeArray(catalog.menus).length)}</strong></div>
    </div>
    <p>Valores e disponibilidade autoritativa permanecem nos domínios Commerce / Inventory / Ticketing.</p>
  </section>`;
}

function actionsPanel(detail, escapeHtml) {
  const actions = detail.actions ?? {};
  const render = (label, values) => `<div><h3>${label}</h3><div class="module-list">${safeArray(values).map((entry)=>`<div class="module-row"><span>${escapeHtml(entry.label ?? entry.key ?? entry.type)}</span><strong>${escapeHtml(entry.reason ?? entry.state ?? "")}</strong></div>`).join("") || '<div class="empty">Nenhuma ação.</div>'}</div></div>`;
  return `<section class="card section-card"><div class="section-title"><h2>Ações no mapa</h2>${sectionState(actions.status ?? "available", escapeHtml)}</div>
    <div class="grid two-col">${render("Automáticas",actions.automatic)}${render("Disponíveis",actions.available)}</div>
    ${render("Incompatíveis",actions.incompatible)}
    <p>O Control Center exibe a resolução recebida do Action Registry; não replica o resolver de CTA no browser.</p>
  </section>`;
}

function previewPanel(detail, escapeHtml) {
  const preview = detail.preview ?? {};
  return `<section class="card section-card">
    <div class="section-title"><h2>Preview público</h2><span class="badge">read-only projection</span></div>
    <div class="business-cms-preview">
      ${preview.coverUrl ? `<img src="${escapeHtml(preview.coverUrl)}" alt="" />` : ""}
      <div><small>${escapeHtml(preview.locale ?? "pt-BR")}</small><h3>${escapeHtml(preview.name ?? detail.profile?.name ?? detail.name ?? "Empresa")}</h3><p>${escapeHtml(preview.description ?? detail.profile?.shortDescription ?? "")}</p>
      <div class="business-cms-preview-actions">${safeArray(preview.actions).map((entry)=>`<span class="badge">${escapeHtml(entry.label ?? entry.type)}</span>`).join("")}</div></div>
    </div>
  </section>`;
}

function publicationPanel(detail, escapeHtml, canMutate) {
  const publication = detail.publication ?? {};
  const validation = safeArray(publication.validation?.errors ?? publication.errors);
  return `<section class="card section-card">
    <div class="section-title"><h2>Publicação</h2><span class="badge">${escapeHtml(statusLabel(publication.state ?? detail.publicationState))}</span></div>
    <div class="module-list">
      <div class="module-row"><span>Published revision</span><strong>${escapeHtml(publication.publishedRevision ?? "—")}</strong></div>
      <div class="module-row"><span>Editable revision</span><strong>${escapeHtml(publication.editableRevision ?? "—")}</strong></div>
      <div class="module-row"><span>Validação</span><strong>${validation.length ? `${validation.length} bloqueio(s)` : "sem bloqueios reportados"}</strong></div>
    </div>
    ${validation.length ? `<ul>${validation.map((entry)=>`<li>${escapeHtml(entry.message ?? entry.code ?? entry)}</li>`).join("")}</ul>` : ""}
    ${canMutate ? '<button class="primary-button" type="button" data-business-publish>Publicar alterações</button>' : ""}
    <p id="business-cms-publication-result" role="status"></p>
  </section>`;
}

function teamPanel(detail, escapeHtml) {
  return `<section class="card section-card"><div class="section-title"><h2>Equipe</h2><span class="badge">${escapeHtml(safeArray(detail.team).length)}</span></div><div class="module-list">${safeArray(detail.team).map((member)=>`<div class="module-row"><span>${escapeHtml(member.email ?? member.id)}</span><strong>${escapeHtml(member.role ?? "")}</strong></div>`).join("") || '<div class="empty">Nenhum membro projetado.</div>'}</div></section>`;
}

function auditPanel(detail, escapeHtml) {
  return `<section class="card section-card"><div class="section-title"><h2>Auditoria</h2><span class="badge">append-only projection</span></div><div class="module-list">${safeArray(detail.audit).slice(0,30).map((entry)=>`<div class="module-row"><span>${escapeHtml(entry.action)}</span><strong>${escapeHtml(entry.result ?? "")} · ${escapeHtml(entry.timestamp ?? "")}</strong></div>`).join("") || '<div class="empty">Nenhum evento no recorte atual.</div>'}</div></section>`;
}

function detailMarkup(detail, escapeHtml, canMutate) {
  const tabs = [
    ["overview","Visão geral", summaryCards(detail, escapeHtml)],
    ["profile","Perfil", profilePanel(detail, escapeHtml, canMutate)],
    ["location","Localização", locationPanel(detail, escapeHtml, canMutate)],
    ["media","Fotos e mídia", mediaPanel(detail, escapeHtml, canMutate)],
    ["catalog","Produtos", catalogPanel(detail, escapeHtml)],
    ["actions","Ações no mapa", actionsPanel(detail, escapeHtml)],
    ["preview","Preview", previewPanel(detail, escapeHtml)],
    ["team","Equipe", teamPanel(detail, escapeHtml)],
    ["audit","Auditoria", auditPanel(detail, escapeHtml)],
    ["publication","Publicação", publicationPanel(detail, escapeHtml, canMutate)],
  ].filter(([,id]) => id !== "catalog" || detail.capabilities?.catalog !== false);
  const buttons=tabs.map(([id,label],index)=>`<button type="button" class="secondary-button" role="tab" data-business-cms-tab="${id}" aria-selected="${index===0}">${label}</button>`).join("");
  const panels=tabs.map(([id,,html],index)=>`<div role="tabpanel" data-business-cms-panel="${id}" ${index===0?"":"hidden"}>${html}</div>`).join("");
  return `
    <div class="business-cms-detail-heading">
      <div><a href="#businesses">← Empresas</a><h2>${escapeHtml(detail.profile?.name ?? detail.name ?? detail.businessId)}</h2><small>${escapeHtml(detail.businessId)} · ${escapeHtml(detail.place?.placeId ?? detail.placeId ?? "sem Place")}</small></div>
      <span class="badge">${escapeHtml(statusLabel(detail.publication?.state ?? detail.publicationState))}</span>
    </div>
    <div class="business-cms-tabs" role="tablist" aria-label="Administração da empresa">${buttons}</div>
    <div class="business-cms-panels">${panels}</div>`;
}

async function requestJson(api, path, init) {
  return api(path, init);
}

async function bindList(root, ctx, model) {
  root.querySelector("#business-cms-filter-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const params = new URLSearchParams(new FormData(event.currentTarget));
    const compact = new URLSearchParams([...params].filter(([,value]) => String(value).trim()));
    globalThis.location.hash = `businesses?${compact.toString()}`;
  });
  const dialog = root.querySelector("#business-cms-wizard");
  root.querySelector("[data-business-cms-new]")?.addEventListener("click", () => dialog?.showModal());
  root.querySelector("#business-cms-create-form")?.addEventListener("submit", async (event) => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    const result = root.querySelector("#business-cms-create-result");
    try {
      const data = Object.fromEntries(new FormData(event.currentTarget));
      result.textContent = "Criando draft…";
      const response = await requestJson(ctx.api, businessCmsContract.create, {
        method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(data),
      });
      const id=response.businessId ?? response.data?.businessId ?? response.data?.id;
      result.textContent = "Draft criado.";
      if (id) globalThis.location.hash=`businesses:${encodeURIComponent(id)}`;
    } catch (error) {
      result.textContent=error.body?.error ?? error.message ?? "Falha ao criar empresa.";
    }
  });
}

function bindTabs(root) {
  const buttons=[...root.querySelectorAll("[data-business-cms-tab]")];
  const activate=(button)=>{
    buttons.forEach((candidate)=>{
      const selected=candidate===button;
      candidate.setAttribute("aria-selected",selected?"true":"false");
      candidate.tabIndex=selected?0:-1;
      const panel=root.querySelector(`[data-business-cms-panel="${candidate.dataset.businessCmsTab}"]`);
      if(panel) panel.hidden=!selected;
    });
  };
  buttons.forEach((button)=>button.addEventListener("click",()=>activate(button)));
}

async function bindDetail(root, ctx, detail) {
  bindTabs(root);
  const id=detail.businessId;
  root.querySelector("#business-cms-profile-form")?.addEventListener("submit", async (event)=>{
    event.preventDefault();
    const result=root.querySelector("#business-cms-profile-result");
    try {
      const body=Object.fromEntries(new FormData(event.currentTarget));
      for(const key of ["subcategoryIds","tags","amenities"]) body[key]=String(body[key]??"").split(",").map((v)=>v.trim()).filter(Boolean);
      result.textContent="Salvando…";
      await requestJson(ctx.api,businessCmsContract.updateProfile(id),{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      result.textContent="Perfil salvo como revisão editável.";
    } catch(error){result.textContent=error.body?.error ?? error.message ?? "Falha ao salvar perfil.";}
  });
  root.querySelector("[data-business-publish]")?.addEventListener("click", async ()=>{
    const result=root.querySelector("#business-cms-publication-result");
    try{
      result.textContent="Validando publicação…";
      await requestJson(ctx.api,businessCmsContract.publish(id),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"publish"})});
      result.textContent="Publicação solicitada ao contrato governado.";
    }catch(error){result.textContent=error.body?.error ?? error.message ?? "Publicação bloqueada.";}
  });
}

export async function renderBusinessCms(ctx, businessId, { legacyRender } = {}) {
  const canMutate = ctx.actorHasCapability("business.update");
  if (!businessId) {
    const hashQuery=(globalThis.location.hash.split("?",2)[1] ?? "");
    const query=hashQuery ? `?${hashQuery}` : "";
    try {
      const model=await requestJson(ctx.api,`${businessCmsContract.list}${query}`);
      ctx.content.innerHTML=listMarkup(model,ctx.escapeHtml,canMutate);
      await bindList(ctx.content,ctx,model);
      return true;
    } catch(error) {
      if (error.status === 501 || error.body?.error === "DOMAIN_ADMIN_CONTRACT_NOT_REGISTERED") {
        if (legacyRender) {
          await legacyRender();
          const callout=document.createElement("div");
          callout.className="callout";
          callout.innerHTML="<strong>Business CMS aguardando composição:</strong> o diretório legado permanece disponível até o adapter canônico de Business/Place ser integrado.";
          ctx.content.prepend(callout);
          return false;
        }
      }
      throw error;
    }
  }

  try {
    const detail=await requestJson(ctx.api,businessCmsContract.detail(businessId));
    ctx.content.innerHTML=(ctx.supportEntityContext?.() ?? "") + detailMarkup(detail,ctx.escapeHtml,canMutate);
    await bindDetail(ctx.content,ctx,detail);
    return true;
  } catch(error) {
    if ((error.status===501 || error.body?.error==="DOMAIN_ADMIN_CONTRACT_NOT_REGISTERED") && legacyRender) {
      await legacyRender(businessId);
      const callout=document.createElement("div");
      callout.className="callout";
      callout.innerHTML="<strong>Modo compatibilidade:</strong> a visão 360º atual foi mantida porque o adapter canônico do Business CMS ainda não está composto.";
      ctx.content.prepend(callout);
      return false;
    }
    ctx.content.innerHTML=unavailableState(ctx.escapeHtml,error.body?.error ?? error.message ?? "Business CMS indisponível.");
    return false;
  }
}
