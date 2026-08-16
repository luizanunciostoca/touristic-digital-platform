const leadsBody = document.querySelector("#leads-body");

function decorateLeadActions(root = document) {
  root.querySelectorAll?.(".lead-action-cell").forEach((cell) => {
    if (!(cell instanceof HTMLElement)) return;
    if (cell.querySelector(".lead-detail-link")) return;
    const editButton = cell.querySelector(".lead-edit-button[data-lead-id]");
    const leadId = editButton?.getAttribute("data-lead-id");
    if (!leadId || !/^\d+$/u.test(leadId)) return;

    const link = document.createElement("a");
    link.className = "lead-edit-button lead-detail-link";
    link.href = `/apps/admin-crm/public/lead-detail.html?id=${encodeURIComponent(leadId)}`;
    link.textContent = "Detalhes";
    cell.prepend(link);
  });
}

if (leadsBody instanceof HTMLElement) {
  const observer = new MutationObserver(() => decorateLeadActions(leadsBody));
  observer.observe(leadsBody, { childList: true, subtree: true });
  decorateLeadActions(leadsBody);
}
