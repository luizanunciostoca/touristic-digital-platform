const target = new URL(
  "/apps/morro-digital-platform/public/business-dashboard.html",
  window.location.origin,
);
target.search = window.location.search;
target.hash = window.location.hash;
window.location.replace(target.href);
