export interface ExploreMarkerElementInput {
  readonly id: string;
  readonly label?: string;
}

export interface ExploreMarkerVisual {
  readonly icon: string;
  readonly color: string;
}

const V1_CATEGORY_VISUALS: Readonly<Record<string, ExploreMarkerVisual>> =
  Object.freeze({
    beaches: Object.freeze({ icon: "🏖️", color: "#0ea5e9" }),
    restaurants: Object.freeze({ icon: "🍴", color: "#f97316" }),
    hotels: Object.freeze({ icon: "🛏️", color: "#8b5cf6" }),
    shops: Object.freeze({ icon: "🛍️", color: "#10b981" }),
    attractions: Object.freeze({ icon: "⛰️", color: "#ef4444" }),
    nightlife: Object.freeze({ icon: "🎵", color: "#ec4899" }),
    tours: Object.freeze({ icon: "🧭", color: "#f59e0b" }),
    emergencies: Object.freeze({ icon: "✚", color: "#dc2626" }),
    transport: Object.freeze({ icon: "🚕", color: "#3b82f6" }),
  });

const FALLBACK_VISUAL = Object.freeze({ icon: "📍", color: "#3b82f6" });

export function getExploreCategoryFromMarkerId(id: string): string | null {
  if (!id.startsWith("explore:")) return null;
  const [, category] = id.split(":", 3);
  return category?.trim() || null;
}

export function getV1ExploreMarkerVisual(
  category: string,
): ExploreMarkerVisual {
  return V1_CATEGORY_VISUALS[category] ?? FALLBACK_VISUAL;
}

function labelLayout(totalHint = 0): {
  readonly fontSize: string;
  readonly maxWidth: string;
  readonly padding: string;
} {
  if (totalHint >= 30) {
    return { fontSize: "10px", maxWidth: "108px", padding: "4px 6px" };
  }
  if (totalHint >= 18) {
    return { fontSize: "10.5px", maxWidth: "124px", padding: "4px 7px" };
  }
  if (totalHint >= 10) {
    return { fontSize: "11px", maxWidth: "142px", padding: "5px 8px" };
  }
  return { fontSize: "12px", maxWidth: "168px", padding: "6px 8px" };
}

/**
 * App-owned category marker presentation matching the audited V1 visual
 * semantics. Returns undefined for non-Explore marker IDs so existing tour
 * marker factories keep ownership of their own presentation.
 */
export function createV1ExploreMarkerElement(
  input: ExploreMarkerElementInput,
): HTMLElement | undefined {
  const category = getExploreCategoryFromMarkerId(input.id);
  if (!category || typeof document === "undefined") return undefined;

  const visual = getV1ExploreMarkerVisual(category);
  const root = document.createElement("div");
  root.className =
    "mapbox-poi-marker mapbox-category-marker morro-explore-marker";
  root.dataset.morroExploreMarker = "true";
  root.dataset.exploreCategory = category;
  root.dataset.markerId = input.id;
  if (input.label) root.dataset.locationName = input.label;
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", input.label ?? `POI ${category}`);
  root.style.position = "relative";
  root.style.width = "36px";
  root.style.height = "36px";
  root.style.cursor = "pointer";
  root.style.zIndex = "10";

  const pin = document.createElement("div");
  pin.className = "morro-explore-marker-icon";
  pin.textContent = visual.icon;
  pin.style.width = "36px";
  pin.style.height = "36px";
  pin.style.borderRadius = "50%";
  pin.style.display = "flex";
  pin.style.alignItems = "center";
  pin.style.justifyContent = "center";
  pin.style.backgroundColor = visual.color;
  pin.style.border = "2px solid white";
  pin.style.boxShadow = "0 2px 8px rgba(0,0,0,0.45)";
  pin.style.color = "white";
  pin.style.fontSize = "17px";
  pin.style.lineHeight = "1";
  pin.style.userSelect = "none";
  root.appendChild(pin);

  if (input.label) {
    const label = document.createElement("span");
    const layout = labelLayout();
    label.className = "morro-explore-marker-label";
    label.textContent = input.label;
    label.style.position = "absolute";
    label.style.left = "50%";
    label.style.bottom = "42px";
    label.style.transform = "translateX(-50%)";
    label.style.maxWidth = layout.maxWidth;
    label.style.padding = layout.padding;
    label.style.borderRadius = "8px";
    label.style.background = "rgba(255,255,255,0.96)";
    label.style.boxShadow = "0 2px 8px rgba(15,23,42,0.18)";
    label.style.color = "#1e293b";
    label.style.fontSize = layout.fontSize;
    label.style.fontWeight = "600";
    label.style.lineHeight = "1.15";
    label.style.whiteSpace = "nowrap";
    label.style.overflow = "hidden";
    label.style.textOverflow = "ellipsis";
    label.style.pointerEvents = "none";
    label.style.userSelect = "none";
    root.appendChild(label);
  }

  return root;
}
