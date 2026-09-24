const params = new URLSearchParams(location.search);
const mode = params.get("mode") || "table_reservation";

async function boot() {
  if (mode === "table_reservation") {
    await import("/commerce-restaurant.js");
    return;
  }
  if (mode === "ticketed_admission") {
    await import("/commerce-admission.js");
    return;
  }

  const target = new URL("/tickets.html", location.origin);
  for (const [key, value] of params.entries()) {
    if (key !== "mode") target.searchParams.append(key, value);
  }
  if (mode === "activity_reservation") {
    target.searchParams.set("mode", "tour");
  }
  location.replace(target);
}

void boot();
