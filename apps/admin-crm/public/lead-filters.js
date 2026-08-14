const form = document.querySelector("#lead-filter-form");
const reset = document.querySelector("#lead-filter-reset");
const status = document.querySelector("#lead-filter-status");
const body = document.querySelector("#leads-body");
const table = document.querySelector("#leads-table");

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function formValue(name) {
  if (!(form instanceof HTMLFormElement)) return "";
  const control = form.elements.namedItem(name);
  if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) {
    return "";
  }
  return normalize(control.value);
}

function applyFilters() {
  if (!(body instanceof HTMLElement)) return;
  const search = formValue("search");
  const stage = formValue("stage");
  const leadStatus = formValue("status");
  let visible = 0;

  for (const row of body.querySelectorAll("tr")) {
    const cells = row.querySelectorAll("td");
    const searchable = normalize(`${cells[0]?.textContent || ""} ${cells[1]?.textContent || ""}`);
    const rowStage = normalize(cells[2]?.textContent);
    const rowStatus = normalize(cells[3]?.textContent);
    const matches =
      (!search || searchable.includes(search)) &&
      (!stage || rowStage === stage) &&
      (!leadStatus || rowStatus === leadStatus);
    row.hidden = !matches;
    if (matches) visible += 1;
  }

  if (table instanceof HTMLTableElement && body.children.length > 0) {
    table.hidden = visible === 0;
  }
  if (status) {
    status.textContent = `${visible} ${visible === 1 ? "lead visível" : "leads visíveis"}.`;
  }
}

if (form instanceof HTMLFormElement) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    applyFilters();
  });
}

reset?.addEventListener("click", () => {
  if (!(form instanceof HTMLFormElement)) return;
  form.reset();
  applyFilters();
});

if (body instanceof HTMLElement) {
  new MutationObserver(() => applyFilters()).observe(body, { childList: true });
}
