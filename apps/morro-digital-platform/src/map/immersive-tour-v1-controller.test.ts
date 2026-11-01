import { afterEach, describe, expect, it, vi } from "vitest";

import * as localization from "../config/tour-localization.js";
import {
  createV1ImmersiveTourController,
  type V1ImmersiveTourRenderRequest,
} from "./immersive-tour-v1-controller.js";

// Exercise the real controller and catalog with DOM events, without a map or
// remote image provider. The fixture implements only the DOM operations used.
class Element extends EventTarget {
  children: Element[] = [];
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  attributes = new Map<string, string>();
  className = "";
  textContent = "";
  hidden = false;
  src = "";
  alt = "";
  loading = "";
  classList = {
    add: (...tokens: string[]) => {
      this.className = `${this.className} ${tokens.join(" ")}`.trim();
    },
  };

  constructor(readonly tagName: string) {
    super();
  }

  appendChild(child: Element): Element {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children: Element[]): void {
    this.children = children;
    this.textContent = "";
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  find(className: string): Element | undefined {
    if (this.className.split(" ").includes(className)) return this;
    for (const child of this.children) {
      const match = child.find(className);
      if (match) return match;
    }
    return undefined;
  }
}

function fixture(locale = "pt-BR") {
  let request: V1ImmersiveTourRenderRequest;
  const document = {
    documentElement: { lang: locale },
    defaultView: null,
    createElement: (tagName: string) => new Element(tagName.toUpperCase()),
  } as unknown as Document;
  const controller = createV1ImmersiveTourController({
    document,
    render: (next) => {
      request = next;
    },
    activateMap: vi.fn(),
    deactivateMap: vi.fn(),
    focusStop: vi.fn(),
    highlightStop: vi.fn(),
    onShowTours: vi.fn(),
    onExploreMap: vi.fn(),
    onMainMenu: vi.fn(),
  });
  return {
    document,
    controller,
    card: () => request.content as unknown as Element,
    select: (value: string) => request.onSelect(value),
    options: () => request.options.map((option) => option.value),
    async start() {
      expect(await controller.start("volta-a-ilha")).toBe(true);
      request.onSelect("__tour_start__");
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("immersive tour photo recovery", () => {
  it.each([
    ["pt-BR", "Foto indisponível para"],
    ["en-US", "Photo unavailable for"],
    ["es-ES", "Foto no disponible para"],
    ["he-IL", "התמונה אינה זמינה עבור"],
  ])(
    "discloses failed media in %s without blocking the tour",
    async (locale, message) => {
      const view = fixture(locale);
      await view.start();
      const card = view.card();
      const photo = card.find("tour-stop-photo");
      expect(photo?.src).toContain("terceira_praia.jpg");
      photo?.dispatchEvent(new Event("error"));

      const fallback = card.find("tour-stop-photo-unavailable");
      expect(fallback).toBeDefined();
      expect(fallback?.hidden).toBe(false);
      expect(fallback?.textContent).toContain(message);
      expect(fallback?.textContent).toContain(
        card.find("tour-stop-title")?.textContent,
      );
      expect(fallback?.getAttribute("role")).toBe("status");
      expect(card.find("tour-stop-photo-wrap")?.hidden).toBe(true);
      expect(card.dataset.photoState).toBe("missing");
      expect(card.find("tour-stop-desc")?.textContent.length).toBeGreaterThan(
        0,
      );
      expect(view.options()).toContain("__tour_next__");
      view.select("__tour_next__");
      expect(view.controller.getState().currentStopIndex).toBe(1);
      view.controller.destroy();
    },
  );

  it("keeps successful photos and retries a failed photo when revisiting the stop", async () => {
    const view = fixture();
    await view.start();
    const firstPhoto = view.card().find("tour-stop-photo");
    firstPhoto?.dispatchEvent(new Event("load"));
    expect(view.card().find("tour-stop-photo-unavailable")?.hidden).toBe(true);
    expect(view.card().find("tour-stop-photo-wrap")?.hidden).toBe(false);

    firstPhoto?.dispatchEvent(new Event("error"));
    expect(view.card().find("tour-stop-photo-unavailable")?.hidden).toBe(false);
    view.select("__tour_next__");
    view.select("__tour_prev__");
    expect(view.card().find("tour-stop-photo")).not.toBe(firstPhoto);
    expect(view.card().find("tour-stop-photo-unavailable")?.hidden).toBe(true);
    expect(view.card().find("tour-stop-photo-wrap")?.hidden).toBe(false);
    view.controller.destroy();
  });

  it("does not apply an old photo failure to a later stop or locale", async () => {
    const view = fixture();
    await view.start();
    const oldPhoto = view.card().find("tour-stop-photo");
    view.select("__tour_next__");
    view.document.documentElement.lang = "en-US";
    view.controller.refreshLocale();
    oldPhoto?.dispatchEvent(new Event("error"));
    expect(view.card().dataset.stopIndex).toBe("1");
    expect(view.card().find("tour-stop-photo-unavailable")?.hidden).toBe(true);
    view.card().find("tour-stop-photo")?.dispatchEvent(new Event("error"));
    expect(
      view.card().find("tour-stop-photo-unavailable")?.textContent,
    ).toContain("Photo unavailable for");
    view.controller.destroy();
  });

  it("discloses absent media without requesting an empty image URL", async () => {
    const tour = localization.localizeMorroTour("volta-a-ilha", "pt-BR")!;
    vi.spyOn(localization, "localizeMorroTour").mockReturnValue({
      ...tour,
      stops: tour.stops.map((stop) => ({ ...stop, photoPath: "" })),
    });
    const view = fixture();
    await view.start();
    expect(view.card().find("tour-stop-photo")).toBeUndefined();
    expect(view.card().find("tour-stop-photo-unavailable")?.hidden).toBe(false);
    expect(
      view.card().find("tour-stop-photo-unavailable")?.textContent,
    ).toContain("Foto indisponível para");
    expect(view.options()).toContain("__tour_next__");
    view.controller.destroy();
  });
});
