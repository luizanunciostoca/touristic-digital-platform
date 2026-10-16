/** Discover-only controls. Provider success is committed only after acknowledgement. */
type Copy = {
  standard: string;
  satellite: string;
  changing: string;
  layerError: string;
  unavailable: string;
  locating: string;
  located: string;
  denied: string;
  locationError: string;
};
const copyFor = (document: Document): Copy =>
  ({
    pt: {
      standard: "Mapa padrão",
      satellite: "Mapa de satélite",
      changing: "Alterando camada…",
      layerError: "Não foi possível alterar a camada.",
      unavailable: "Recurso indisponível neste mapa.",
      locating: "Obtendo localização…",
      located: "Localização exibida no mapa.",
      denied: "Permita a localização no navegador para centralizar o mapa.",
      locationError: "Não foi possível obter sua localização. Tente novamente.",
    },
    en: {
      standard: "Standard map",
      satellite: "Satellite map",
      changing: "Changing layer…",
      layerError: "Could not change the map layer.",
      unavailable: "Unavailable on this map.",
      locating: "Getting location…",
      located: "Location shown on the map.",
      denied: "Allow browser location access to center the map.",
      locationError: "Could not get your location. Try again.",
    },
    es: {
      standard: "Mapa estándar",
      satellite: "Mapa satelital",
      changing: "Cambiando capa…",
      layerError: "No se pudo cambiar la capa.",
      unavailable: "No disponible en este mapa.",
      locating: "Obteniendo ubicación…",
      located: "Ubicación mostrada en el mapa.",
      denied: "Permita la ubicación en el navegador para centrar el mapa.",
      locationError: "No se pudo obtener su ubicación. Inténtelo de nuevo.",
    },
    he: {
      standard: "מפה רגילה",
      satellite: "מפת לוויין",
      changing: "החלפת שכבה…",
      layerError: "לא ניתן להחליף שכבה.",
      unavailable: "לא זמין במפה זו.",
      locating: "איתור מיקום…",
      located: "המיקום מוצג במפה.",
      denied: "יש לאפשר גישה למיקום בדפדפן כדי למרכז את המפה.",
      locationError: "לא ניתן לקבל את המיקום. נסו שוב.",
    },
  })[document.documentElement.lang.slice(0, 2) as "pt" | "en" | "es" | "he"] ??
  copyForPt;
const copyForPt: Copy = {
  standard: "Mapa padrão",
  satellite: "Mapa de satélite",
  changing: "Alterando camada…",
  layerError: "Não foi possível alterar a camada.",
  unavailable: "Recurso indisponível neste mapa.",
  locating: "Obtendo localização…",
  located: "Localização exibida no mapa.",
  denied: "Permita a localização no navegador para centralizar o mapa.",
  locationError: "Não foi possível obter sua localização. Tente novamente.",
};
function feedback(document: Document, button: HTMLElement) {
  const status = document.createElement("p");
  status.className = "md-discover-control-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.hidden = true;
  button.parentElement?.append(status);
  let key: keyof Copy | undefined;
  const render = () => {
    status.textContent = key ? copyFor(document)[key] : "";
    status.hidden = !key;
  };
  const observer = new MutationObserver(render);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"],
  });
  return {
    show(next: keyof Copy) {
      key = next;
      render();
    },
    destroy() {
      observer.disconnect();
      status.remove();
    },
  };
}
export interface DiscoverStylePort {
  setStyle?: (style: string) => unknown;
  on?: (event: string, listener: () => void) => unknown;
  off?: (event: string, listener: () => void) => unknown;
}
export function installDiscoverLayer({
  document,
  map,
  standardStyle,
  satelliteStyle,
}: {
  document: Document;
  map: DiscoverStylePort;
  standardStyle: string;
  satelliteStyle: string;
}): () => void {
  const button = document.getElementById("toggle-map-layer");
  const element = document.getElementById("map");
  if (!(button instanceof HTMLButtonElement)) return () => {};
  const status = feedback(document, button);
  let destroyed = false,
    satellite = false,
    known = true,
    pending = false,
    timer: ReturnType<typeof setTimeout> | undefined;
  const available = Boolean(map.setStyle && map.on && map.off);
  const render = () => {
    button.disabled = !available || pending;
    button.setAttribute("aria-disabled", String(button.disabled));
    button.setAttribute("aria-busy", String(pending));
    button.classList.toggle("active", known && satellite);
    button.setAttribute("aria-pressed", known ? String(satellite) : "mixed");
    button.setAttribute(
      "aria-label",
      copyFor(document)[satellite ? "standard" : "satellite"],
    );
    element?.setAttribute(
      "data-map-layer",
      known ? (satellite ? "satellite" : "standard") : "unknown",
    );
  };
  const clear = () => {
    map.off?.("style.load", success);
    map.off?.("error", failure);
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const success = () => {
    if (destroyed || !pending) return;
    clear();
    known = true;
    satellite = !satellite;
    pending = false;
    render();
    status.show(satellite ? "satellite" : "standard");
  };
  const failure = () => {
    if (destroyed || !pending) return;
    clear();
    known = false;
    pending = false;
    render();
    status.show("layerError");
  };
  const click = () => {
    if (destroyed || pending || !available) return;
    pending = true;
    render();
    status.show("changing");
    map.on?.("style.load", success);
    map.on?.("error", failure);
    timer = setTimeout(failure, 10000);
    try {
      map.setStyle?.(satellite ? standardStyle : satelliteStyle);
    } catch {
      failure();
    }
  };
  const observer = new MutationObserver(render);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"],
  });
  render();
  if (!available) status.show("unavailable");
  button.addEventListener("click", click);
  return () => {
    if (destroyed) return;
    destroyed = true;
    clear();
    observer.disconnect();
    status.destroy();
    button.removeEventListener("click", click);
    button.disabled = true;
    button.removeAttribute("aria-busy");
  };
}
export function installDiscoverLocation({
  document,
  currentLocation,
  onLocation,
}: {
  document: Document;
  currentLocation: () => readonly [number, number] | undefined;
  onLocation: (center: readonly [number, number]) => void;
}): () => void {
  const button = document.getElementById("recenter-map-control");
  const map = document.getElementById("map");
  if (!(button instanceof HTMLButtonElement)) return () => {};
  const status = feedback(document, button);
  let destroyed = false,
    generation = 0;
  const report = (state: string, key: keyof Copy) => {
    map?.setAttribute("data-geolocation-state", state);
    status.show(key);
    button.removeAttribute("aria-busy");
  };
  const click = () => {
    if (destroyed) return;
    const request = ++generation;
    const cached = currentLocation();
    if (cached) {
      try {
        onLocation(cached);
        report("ready", "located");
      } catch {
        report("error", "locationError");
      }
      return;
    }
    const geo = document.defaultView?.navigator.geolocation;
    if (!geo) {
      report("unavailable", "unavailable");
      return;
    }
    button.setAttribute("aria-busy", "true");
    status.show("locating");
    geo.getCurrentPosition(
      (position) => {
        if (destroyed || request !== generation) return;
        try {
          onLocation([position.coords.longitude, position.coords.latitude]);
          report("ready", "located");
        } catch {
          report("error", "locationError");
        }
      },
      (error) => {
        if (destroyed || request !== generation) return;
        report(
          error.code === 1 ? "denied" : "error",
          error.code === 1 ? "denied" : "locationError",
        );
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 8000 },
    );
  };
  button.addEventListener("click", click);
  return () => {
    destroyed = true;
    generation++;
    button.removeEventListener("click", click);
    button.removeAttribute("aria-busy");
    status.destroy();
  };
}

/** Reparents existing controls without cloning them or replacing their handlers. */
export function installDiscoverLayersGroup(document: Document): () => void {
  const ids = ["toggle-3d-mode", "toggle-map-layer", "toggle-globe-view"];
  const buttons = ids.map((id) => document.getElementById(id));
  const parent = buttons[0]?.parentElement;
  if (
    !parent ||
    buttons.some((button) => !button || button.parentElement !== parent)
  )
    return () => {};
  const group = document.createElement("div");
  group.className = "md-discover-layers";
  group.setAttribute("role", "group");
  const anchors = buttons.map((button) => {
    const anchor = document.createComment("discover-layer-control");
    button!.before(anchor);
    return anchor;
  });
  parent.insertBefore(group, anchors[0]!);
  for (const button of buttons) group.append(button!);
  const render = () => {
    group.setAttribute(
      "aria-label",
      { pt: "Camadas", en: "Layers", es: "Capas", he: "שכבות" }[
        document.documentElement.lang.slice(0, 2) as "pt" | "en" | "es" | "he"
      ] ?? "Camadas",
    );
  };
  render();
  const observer = new MutationObserver(render);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"],
  });
  return () => {
    observer.disconnect();
    buttons.forEach((button, index) => anchors[index]?.replaceWith(button!));
    group.remove();
  };
}
