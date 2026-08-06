const isMobile = window.matchMedia("(max-width: 640px)").matches;
const center = isMobile ? [-13.3885, -38.9105] : [-13.3935, -38.925];
const initialZoom = isMobile ? 14 : 13;

const map = L.map("map", {
  center,
  zoom: initialZoom,
  zoomControl: false,
  attributionControl: true,
});

const streetLayer = L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  },
).addTo(map);

const topoLayer = L.tileLayer(
  "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 17,
    attribution: "&copy; OpenTopoMap contributors",
  },
);

const points = [
  { name: "Cais", coords: [-13.3766, -38.9165], icon: "⚓" },
  {
    name: "Igreja Nossa Senhora da Luz",
    coords: [-13.3775, -38.9153],
    icon: "✦",
  },
  {
    name: "Praça Aureliano Lima",
    coords: [-13.3782, -38.9148],
    icon: "●",
  },
  { name: "Farol do Morro", coords: [-13.3786, -38.9119], icon: "⌂" },
  { name: "Primeira Praia", coords: [-13.3803, -38.9101], icon: "☀" },
  { name: "Segunda Praia", coords: [-13.3834, -38.9094], icon: "☀" },
  { name: "Terceira Praia", coords: [-13.3866, -38.9087], icon: "☀" },
  { name: "Toca do Morcego", coords: [-13.3797, -38.9127], icon: "★" },
  {
    name: "Fortaleza de Tapirandu",
    coords: [-13.3754, -38.9187],
    icon: "◆",
  },
];

for (const point of points) {
  const icon = L.divIcon({
    className: "",
    html: `<span class="poi-marker" aria-hidden="true">${point.icon}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

  L.marker(point.coords, { icon })
    .addTo(map)
    .bindTooltip(`<span class="poi-label">${point.name}</span>`, {
      permanent: !isMobile,
      direction: "right",
      offset: [14, 0],
      className: "poi-tooltip",
    })
    .bindPopup(
      `<strong>${point.name}</strong><br />Explore este local no Morro Digital.`,
    );
}

let usingTopo = false;
document
  .querySelector("#zoomInButton")
  .addEventListener("click", () => map.zoomIn());
document
  .querySelector("#zoomOutButton")
  .addEventListener("click", () => map.zoomOut());
document.querySelector("#layersButton").addEventListener("click", () => {
  if (usingTopo) {
    map.removeLayer(topoLayer);
    streetLayer.addTo(map);
  } else {
    map.removeLayer(streetLayer);
    topoLayer.addTo(map);
  }
  usingTopo = !usingTopo;
});

document.querySelector("#locateButton").addEventListener("click", () => {
  map.locate({ setView: true, maxZoom: 17 });
});

map.on("locationfound", (event) => {
  L.circleMarker(event.latlng, {
    radius: 8,
    color: "#ffffff",
    weight: 3,
    fillColor: "#16a34a",
    fillOpacity: 1,
  })
    .addTo(map)
    .bindPopup("Você está aqui!")
    .openPopup();
});

map.on("locationerror", () => {
  map.setView(center, initialZoom);
});

const assistantCard = document.querySelector(".assistant-card");
const assistantOpen = document.querySelector("#assistantOpen");
document.querySelector("#assistantClose").addEventListener("click", () => {
  assistantCard.hidden = true;
  assistantOpen.classList.add("is-visible");
});
assistantOpen.addEventListener("click", () => {
  assistantCard.hidden = false;
  assistantOpen.classList.remove("is-visible");
});

document.querySelector("#assistantForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("#assistantInput");
  const question = input.value.trim();
  if (!question) return;
  assistantCard.hidden = false;
  assistantOpen.classList.remove("is-visible");
  assistantCard.querySelector("strong").textContent =
    "Estou preparando esta experiência para você.";
  assistantCard.querySelector("span").textContent =
    `Sua pergunta foi: “${question}”. A integração completa do assistente será conectada durante a migração funcional.`;
  input.value = "";
});

const onboarding = document.querySelector("#onboarding");
const closeOnboarding = () => {
  onboarding.hidden = true;
  map.invalidateSize();
};

document
  .querySelector("#skipTutorial")
  .addEventListener("click", closeOnboarding);
document
  .querySelector("#nextTutorial")
  .addEventListener("click", closeOnboarding);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !onboarding.hidden) closeOnboarding();
});

window.addEventListener("resize", () => map.invalidateSize());
