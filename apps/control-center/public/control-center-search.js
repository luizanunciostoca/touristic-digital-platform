const defaultPageSize = 20;

function foldSearchText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR");
}

function safeSearchHref(value) {
  const href = String(value ?? "").trim();
  return href.startsWith("#") || href.startsWith("/apps/") ? href : "";
}

function highlightedRange(value, query) {
  const source = String(value ?? "");
  const needle = foldSearchText(query);
  if (!source || !needle) return null;

  let folded = "";
  const ranges = [];
  let sourceOffset = 0;
  for (const character of source) {
    const start = sourceOffset;
    sourceOffset += character.length;
    const normalized = foldSearchText(character);
    for (const foldedCharacter of normalized) {
      folded += foldedCharacter;
      ranges.push({ start, end: sourceOffset });
    }
  }
  const index = folded.indexOf(needle);
  if (index < 0 || ranges.length === 0) return null;
  const last = index + needle.length - 1;
  if (!ranges[index] || !ranges[last]) return null;
  return { start: ranges[index].start, end: ranges[last].end };
}

function appendHighlightedText(target, value, query) {
  const text = String(value ?? "");
  const range = highlightedRange(text, query);
  if (!range) {
    target.append(document.createTextNode(text));
    return;
  }
  target.append(document.createTextNode(text.slice(0, range.start)));
  const mark = document.createElement("mark");
  mark.textContent = text.slice(range.start, range.end);
  target.append(mark);
  target.append(document.createTextNode(text.slice(range.end)));
}

function optionId(index) {
  return "universal-search-option-" + String(index);
}

export function createUniversalSearchController({
  input,
  results,
  destinationSelect,
  api,
  navigate = (href) => {
    if (href.startsWith("#")) {
      globalThis.location.hash = href;
      globalThis.requestAnimationFrame?.(() =>
        document.querySelector(".page")?.focus(),
      );
      return;
    }
    globalThis.location.assign(href);
  },
  debounceMs = 240,
} = {}) {
  if (!input || !results || typeof api !== "function") {
    throw new Error("UNIVERSAL_SEARCH_CONTROLLER_INPUT_REQUIRED");
  }

  let timer = null;
  let activeRequest = null;
  let activeIndex = -1;
  let requestSequence = 0;
  let currentOffset = 0;
  let lastPayload = null;

  function options() {
    return Array.from(results.querySelectorAll('[role="option"][data-href]'));
  }

  function setExpanded(expanded) {
    results.hidden = !expanded;
    input.setAttribute("aria-expanded", String(expanded));
  }

  function clearActive() {
    activeIndex = -1;
    input.removeAttribute("aria-activedescendant");
    for (const option of options()) {
      option.setAttribute("aria-selected", "false");
    }
  }

  function close() {
    setExpanded(false);
    clearActive();
  }

  function setActive(index) {
    const items = options();
    if (items.length === 0) {
      clearActive();
      return;
    }
    activeIndex = ((index % items.length) + items.length) % items.length;
    items.forEach((item, itemIndex) => {
      item.setAttribute(
        "aria-selected",
        itemIndex === activeIndex ? "true" : "false",
      );
    });
    const active = items[activeIndex];
    input.setAttribute("aria-activedescendant", active.id);
    active.scrollIntoView?.({ block: "nearest" });
  }

  function renderMessage(message, role = "status") {
    results.replaceChildren();
    const state = document.createElement("div");
    state.className = "search-state";
    state.setAttribute("role", role);
    state.textContent = message;
    results.append(state);
    setExpanded(true);
    clearActive();
  }

  function renderPagination(payload) {
    const pagination = payload?.pagination;
    if (!pagination || (pagination.offset === 0 && !pagination.hasMore)) return;

    const controls = document.createElement("div");
    controls.className = "search-pagination";
    controls.setAttribute("aria-label", "Paginação da busca");

    const previous = document.createElement("button");
    previous.type = "button";
    previous.className = "search-page-button";
    previous.textContent = "Anterior";
    previous.disabled = pagination.offset <= 0;
    previous.addEventListener("click", () => {
      const nextOffset = Math.max(
        0,
        pagination.offset - (pagination.limit || defaultPageSize),
      );
      void runSearch({ offset: nextOffset });
    });

    const summary = document.createElement("span");
    const from =
      pagination.total === 0
        ? 0
        : Math.min(pagination.offset + 1, pagination.total);
    const to = Math.min(
      pagination.offset + (payload.results?.length ?? 0),
      pagination.total,
    );
    summary.textContent = from + "–" + to + " de " + pagination.total;

    const next = document.createElement("button");
    next.type = "button";
    next.className = "search-page-button";
    next.textContent = "Próxima";
    next.disabled = !pagination.hasMore;
    next.addEventListener("click", () => {
      if (pagination.nextOffset === null) return;
      void runSearch({ offset: pagination.nextOffset });
    });

    controls.append(previous, summary, next);
    results.append(controls);
  }

  function renderPayload(payload) {
    lastPayload = payload;
    results.replaceChildren();

    if (Array.isArray(payload.partial) && payload.partial.length > 0) {
      const partial = document.createElement("div");
      partial.className = "search-partial";
      partial.setAttribute("role", "status");
      const domains = payload.partial
        .map((entry) => String(entry.domain ?? "").trim())
        .filter(Boolean);
      partial.textContent =
        "Resultados parciais" +
        (domains.length ? ": " + Array.from(new Set(domains)).join(", ") : "") +
        ".";
      results.append(partial);
    }

    const groups = Array.isArray(payload.groups) ? payload.groups : [];
    if (groups.length === 0) {
      const empty = document.createElement("div");
      empty.className = "search-state";
      empty.setAttribute("role", "status");
      empty.textContent =
        payload.state === "partial"
          ? "Nenhum resultado disponível nas fontes acessíveis."
          : "Nenhum resultado encontrado.";
      results.append(empty);
      renderPagination(payload);
      setExpanded(true);
      clearActive();
      return;
    }

    let optionIndex = 0;
    for (const group of groups) {
      const section = document.createElement("section");
      section.className = "search-group";
      section.setAttribute("role", "group");

      const heading = document.createElement("h3");
      heading.className = "search-group-title";
      heading.id = "search-group-" + String(group.type ?? optionIndex);
      heading.textContent =
        String(group.label ?? group.type ?? "Resultados") +
        " (" +
        String(group.count ?? group.results?.length ?? 0) +
        ")";
      section.setAttribute("aria-labelledby", heading.id);
      section.append(heading);

      for (const result of group.results ?? []) {
        const href = safeSearchHref(result.href);
        if (!href) continue;

        const option = document.createElement("button");
        option.type = "button";
        option.className = "search-result";
        option.id = optionId(optionIndex++);
        option.dataset.href = href;
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", "false");

        const copy = document.createElement("span");
        copy.className = "search-result-copy";
        const strong = document.createElement("strong");
        appendHighlightedText(strong, result.title, payload.query);
        copy.append(strong);

        if (result.context || result.domain) {
          const detail = document.createElement("small");
          detail.textContent = String(result.context || result.domain || "");
          copy.append(detail);
        }

        const arrow = document.createElement("span");
        arrow.className = "search-result-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "↗";
        option.append(copy, arrow);
        section.append(option);
      }

      if (section.querySelector('[role="option"]')) results.append(section);
    }

    renderPagination(payload);
    setExpanded(true);
    clearActive();
  }

  function currentDestinationSelect() {
    return (
      document.querySelector("#destination-selector") ??
      (destinationSelect?.isConnected ? destinationSelect : null)
    );
  }

  function selectedDestinationId() {
    const value = String(currentDestinationSelect()?.value ?? "").trim();
    return value && value !== "global" ? value : "";
  }

  async function runSearch({ offset = 0 } = {}) {
    const query = input.value.trim();
    if (Array.from(query).length < 2) {
      activeRequest?.abort();
      activeRequest = null;
      lastPayload = null;
      currentOffset = 0;
      close();
      results.replaceChildren();
      return;
    }

    currentOffset = offset;
    activeRequest?.abort();
    const controller = new AbortController();
    activeRequest = controller;
    const sequence = ++requestSequence;
    renderMessage("Buscando…");

    const params = new URLSearchParams({
      q: query,
      limit: String(defaultPageSize),
      offset: String(offset),
    });
    const destinationId = selectedDestinationId();
    if (destinationId) params.set("destinationId", destinationId);

    try {
      const payload = await api("/search?" + params.toString(), {
        signal: controller.signal,
      });
      if (sequence !== requestSequence) return;
      renderPayload(payload);
    } catch (error) {
      if (controller.signal.aborted || sequence !== requestSequence) return;
      renderMessage(
        error?.status === 429
          ? "Muitas buscas em sequência. Tente novamente em alguns segundos."
          : "Não foi possível concluir a busca.",
        "alert",
      );
    } finally {
      if (activeRequest === controller) activeRequest = null;
    }
  }

  function cancelPendingSearch() {
    if (timer) {
      globalThis.clearTimeout(timer);
      timer = null;
    }
    activeRequest?.abort();
    activeRequest = null;
    requestSequence += 1;
  }

  function scheduleSearch() {
    cancelPendingSearch();
    lastPayload = null;
    currentOffset = 0;
    clearActive();

    const query = input.value.trim();
    if (Array.from(query).length < 2) {
      results.replaceChildren();
      close();
      return;
    }

    renderMessage("Buscando…");
    timer = globalThis.setTimeout(() => {
      timer = null;
      void runSearch({ offset: 0 });
    }, debounceMs);
  }

  function activate(item) {
    const href = safeSearchHref(item?.dataset?.href);
    if (!href) return;
    cancelPendingSearch();
    input.value = "";
    close();
    navigate(href);
  }

  input.addEventListener("input", scheduleSearch);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelPendingSearch();
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (results.hidden && lastPayload) renderPayload(lastPayload);
      setActive(activeIndex + 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (results.hidden && lastPayload) renderPayload(lastPayload);
      const items = options();
      setActive(activeIndex < 0 ? items.length - 1 : activeIndex - 1);
      return;
    }
    if (event.key === "Enter" && !results.hidden) {
      const items = options();
      const item = items[activeIndex >= 0 ? activeIndex : 0];
      if (item) {
        event.preventDefault();
        activate(item);
      }
    }
  });

  results.addEventListener("click", (event) => {
    const item = event.target.closest?.('[role="option"][data-href]');
    if (item) activate(item);
  });

  document.addEventListener("change", (event) => {
    if (!event.target?.matches?.("#destination-selector")) return;
    cancelPendingSearch();
    lastPayload = null;
    if (Array.from(input.value.trim()).length >= 2) {
      void runSearch({ offset: 0 });
      return;
    }
    close();
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      input.focus();
      input.select();
      if (lastPayload && input.value.trim()) renderPayload(lastPayload);
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (
      !results.hidden &&
      event.target !== input &&
      !results.contains(event.target) &&
      !input.closest(".search-wrap")?.contains(event.target)
    ) {
      cancelPendingSearch();
      close();
    }
  });

  async function loadDestinations() {
    const select = currentDestinationSelect();
    if (!select) return;
    try {
      const payload = await api("/destinations");
      const destinations = Array.isArray(payload.destinations)
        ? payload.destinations
        : [];
      const selected = select.value;
      const first =
        select.querySelector('option[value=""]') ||
        select.querySelector('option[value="global"]');
      select.replaceChildren();
      if (first) select.append(first);
      for (const destination of destinations) {
        if (!destination?.id) continue;
        const option = document.createElement("option");
        option.value = destination.id;
        option.textContent =
          destination.branding?.name ||
          destination.branding?.shortName ||
          destination.id;
        select.append(option);
      }
      if (
        selected &&
        Array.from(select.options).some((option) => option.value === selected)
      ) {
        select.value = selected;
      }
    } catch {
      select.dataset.state = "partial";
      select.title =
        "Lista de destinos indisponível; busca global permanece disponível.";
    }
  }

  return Object.freeze({
    loadDestinations,
    runSearch,
    close,
    getState() {
      return Object.freeze({
        activeIndex,
        currentOffset,
        expanded: !results.hidden,
      });
    },
  });
}

export const universalSearchTesting = Object.freeze({
  foldSearchText,
  safeSearchHref,
  highlightedRange,
});
