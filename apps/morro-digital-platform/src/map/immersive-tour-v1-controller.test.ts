import { afterEach, describe, expect, it, vi } from "vitest";

import * as localization from "../config/tour-localization.js";
import {
  createV1ImmersiveTourController,
  type V1ImmersiveTourRenderRequest,
  type V1ImmersiveTourControllerOptions,
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

function fixture(
  locale = "pt-BR",
  ports: Partial<
    Pick<V1ImmersiveTourControllerOptions, "activateMap" | "deactivateMap">
  > = {},
) {
  let request: V1ImmersiveTourRenderRequest;
  const document = {
    documentElement: { lang: locale },
    defaultView: null,
    createElement: (tagName: string) => new Element(tagName.toUpperCase()),
  } as unknown as Document;
  const render = vi.fn((next: V1ImmersiveTourRenderRequest) => {
    request = next;
  });
  const activateMap = vi.fn(ports.activateMap ?? (() => undefined));
  const deactivateMap = vi.fn(ports.deactivateMap ?? (() => undefined));
  const onMainMenu = vi.fn();
  const controller = createV1ImmersiveTourController({
    document,
    render,
    activateMap,
    deactivateMap,
    focusStop: vi.fn(),
    highlightStop: vi.fn(),
    onShowTours: vi.fn(),
    onExploreMap: vi.fn(),
    onMainMenu,
  });
  return {
    document,
    controller,
    render,
    activateMap,
    deactivateMap,
    onMainMenu,
    card: () => request.content as unknown as Element,
    select: (value: string) => request.onSelect(value),
    options: () => request.options.map((option) => option.value),
    renderedOptions: () => request.options,
    async start() {
      expect(await controller.start("volta-a-ilha")).toBe(true);
      request.onSelect("__tour_start__");
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("immersive tour map presentation commands", () => {
  it.each([
    ["pt-BR", "▶️ Explorar roteiro no mapa", "➡️ Ver próxima parada"],
    ["en-US", "▶️ Explore itinerary on the map", "➡️ View next stop"],
    [
      "es-ES",
      "▶️ Explorar el itinerario en el mapa",
      "➡️ Ver siguiente parada",
    ],
    ["he-IL", "▶️ חקור את המסלול במפה", "➡️ צפה בעצירה הבאה"],
  ])(
    "keeps the map presentation commands behind the labels in %s",
    async (locale, start, next) => {
      const view = fixture(locale);
      expect(await view.controller.start("volta-a-ilha")).toBe(true);
      expect(view.controller.getState().stage).toBe("intro");

      const startOption = view
        .renderedOptions()
        .find((option) => option.label === start);
      expect(startOption?.value).toBe("__tour_start__");
      view.select(startOption!.value);
      expect(view.controller.getState()).toMatchObject({
        stage: "stop",
        currentStopIndex: 0,
      });

      const nextOption = view
        .renderedOptions()
        .find((option) => option.label === next);
      expect(nextOption?.value).toBe("__tour_next__");
      view.select(nextOption!.value);
      expect(view.controller.getState()).toMatchObject({
        stage: "stop",
        currentStopIndex: 1,
      });
      view.controller.destroy();
    },
  );
});

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

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const settleStart = (promise: Promise<boolean>) =>
  promise.then(
    (value) => ({ value, error: undefined }),
    (error: unknown) => ({ value: undefined, error }),
  );

describe("immersive tour asynchronous causality", () => {
  it.each(["resolve", "reject"] as const)(
    "keeps the newer successful tour after an old activation %s",
    async (outcome) => {
      const old = deferred();
      const view = fixture("pt-BR", {
        activateMap: (id) => (id === "volta-a-ilha" ? old.promise : undefined),
      });
      const first = settleStart(view.controller.start("volta-a-ilha"));
      expect(await view.controller.start("trilha-gamboa")).toBe(true);
      const renders = view.render.mock.calls.length;
      const cleanups = view.deactivateMap.mock.calls.length;
      if (outcome === "resolve") old.resolve();
      else old.reject(new Error("OBSOLETE_ACTIVATION"));
      expect(await first).toEqual({ value: false, error: undefined });
      expect(view.controller.getState()).toMatchObject({
        stage: "intro",
        tourId: "trilha-gamboa",
      });
      expect(view.render).toHaveBeenCalledTimes(renders);
      expect(view.deactivateMap).toHaveBeenCalledTimes(cleanups);
    },
  );

  it.each(
    (["stop", "destroy"] as const).flatMap((action) =>
      (["resolve", "reject"] as const).map((outcome) => ({ action, outcome })),
    ),
  )(
    "does not revive a tour after $action and late $outcome",
    async ({ action, outcome }) => {
      const activation = deferred();
      const view = fixture("pt-BR", { activateMap: () => activation.promise });
      const starting = settleStart(view.controller.start("volta-a-ilha"));
      if (action === "stop") await view.controller.stop(false);
      else view.controller.destroy();
      const renders = view.render.mock.calls.length;
      const cleanups = view.deactivateMap.mock.calls.length;
      if (outcome === "resolve") activation.resolve();
      else activation.reject(new Error("CANCELLED_ACTIVATION"));
      expect(await starting).toEqual({ value: false, error: undefined });
      expect(view.controller.getState().stage).toBe("idle");
      expect(view.render).toHaveBeenCalledTimes(renders);
      expect(view.deactivateMap).toHaveBeenCalledTimes(cleanups);
    },
  );

  it("finishes pending map cleanup before activating a newer tour", async () => {
    const cleanup = deferred();
    let mapTour: string | null = null;
    const view = fixture("pt-BR", {
      activateMap: (id) => {
        mapTour = id;
      },
      deactivateMap: async () => {
        await cleanup.promise;
        mapTour = null;
      },
    });
    await view.controller.start("volta-a-ilha");
    const stopping = view.controller.stop();
    const starting = view.controller.start("trilha-gamboa");
    await Promise.resolve();
    const activationsBeforeCleanup = view.activateMap.mock.calls.length;
    cleanup.resolve();
    await stopping;
    expect(await starting).toBe(true);
    expect(activationsBeforeCleanup).toBe(1);
    expect(mapTour).toBe("trilha-gamboa");
    expect(view.controller.getState().tourId).toBe("trilha-gamboa");
    expect(view.card().find("tour-intro-title")?.textContent).toContain(
      "Gamboa",
    );
  });

  it("does not render an ended card when destroy supersedes a pending stop", async () => {
    const cleanup = deferred();
    const view = fixture("pt-BR", { deactivateMap: () => cleanup.promise });
    await view.controller.start("volta-a-ilha");
    const renders = view.render.mock.calls.length;
    const stopping = view.controller.stop();
    view.controller.destroy();
    cleanup.resolve();
    await stopping;
    expect(view.controller.getState().stage).toBe("idle");
    expect(view.render).toHaveBeenCalledTimes(renders);
  });

  it("lets only the latest overlapping start activate after cleanup, including a reused tour ID", async () => {
    const cleanup = deferred();
    const view = fixture("pt-BR", { deactivateMap: () => cleanup.promise });
    await view.controller.start("volta-a-ilha");
    const superseded = settleStart(view.controller.start("trilha-gamboa"));
    const latest = view.controller.start("volta-a-ilha");
    cleanup.resolve();
    expect(await superseded).toEqual({ value: false, error: undefined });
    expect(await latest).toBe(true);
    expect(view.activateMap.mock.calls.map(([id]) => id)).toEqual([
      "volta-a-ilha",
      "volta-a-ilha",
    ]);
    expect(view.controller.getState().tourId).toBe("volta-a-ilha");
  });

  it.each([false, true])(
    "preserves the current activation error and cleanup when cleanup rejects=%s",
    async (rejectCleanup) => {
      const failure = new Error("CURRENT_ACTIVATION");
      const view = fixture("pt-BR", {
        activateMap: () => Promise.reject(failure),
        deactivateMap: () =>
          rejectCleanup ? Promise.reject(new Error("CLEANUP")) : undefined,
      });
      expect(await settleStart(view.controller.start("volta-a-ilha"))).toEqual({
        value: undefined,
        error: failure,
      });
      expect(view.controller.getState().stage).toBe("idle");
      expect(view.deactivateMap).toHaveBeenCalledTimes(1);
      expect(view.render).not.toHaveBeenCalled();
    },
  );

  it("keeps a newer tour when it starts during previous activation failure cleanup", async () => {
    const cleanup = deferred();
    const entered = deferred();
    let mapTour: string | null = null;
    const view = fixture("pt-BR", {
      activateMap: (id) => {
        if (id === "volta-a-ilha")
          return Promise.reject(new Error("CURRENT_UNTIL_SUPERSEDED"));
        mapTour = id;
      },
      deactivateMap: async () => {
        entered.resolve();
        await cleanup.promise;
        mapTour = null;
      },
    });
    const first = settleStart(view.controller.start("volta-a-ilha"));
    await entered.promise;
    const latest = view.controller.start("trilha-gamboa");
    cleanup.resolve();
    expect(await first).toEqual({ value: false, error: undefined });
    expect(await latest).toBe(true);
    expect(mapTour).toBe("trilha-gamboa");
    expect(view.controller.getState().tourId).toBe("trilha-gamboa");
  });

  it("does not navigate to an old final action after a newer tour starts during cleanup", async () => {
    const cleanup = deferred();
    const view = fixture("pt-BR", { deactivateMap: () => cleanup.promise });
    await view.start();
    view.controller.goToStop(view.controller.getState().totalStops - 1);
    view.select("__tour_finish__");
    view.select("__tour_main_menu__");
    const latest = view.controller.start("trilha-gamboa");
    cleanup.resolve();
    expect(await latest).toBe(true);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(view.onMainMenu).not.toHaveBeenCalled();
    expect(view.controller.getState().tourId).toBe("trilha-gamboa");
  });
});

describe("immersive tour delayed finale cleanup", () => {
  it("waits for a cleanup already started by the finale timer before a newer map activation", async () => {
    const cleanup = deferred();
    let mapTour: string | null = null;
    let cleanupCalls = 0;
    let finaleTimer: (() => void) | undefined;
    const view = fixture("pt-BR", {
      activateMap: (id) => {
        mapTour = id;
      },
      deactivateMap: async () => {
        cleanupCalls++;
        if (cleanupCalls === 1) await cleanup.promise;
        mapTour = null;
      },
    });
    await view.start();
    view.controller.goToStop(view.controller.getState().totalStops - 1);
    Object.defineProperty(view.document, "defaultView", {
      value: {
        setTimeout(callback: () => void) {
          finaleTimer = callback;
          return 1;
        },
        clearTimeout() {},
      },
    });
    view.select("__tour_finish__");
    expect(finaleTimer).toBeDefined();
    finaleTimer!();
    const latest = view.controller.start("trilha-gamboa");
    let activationsBeforeCleanup = 0;
    await new Promise<void>((resolve) =>
      setTimeout(() => {
        activationsBeforeCleanup = view.activateMap.mock.calls.length;
        cleanup.resolve();
        resolve();
      }, 0),
    );
    expect(await latest).toBe(true);
    expect(activationsBeforeCleanup).toBe(1);
    expect(cleanupCalls).toBe(1);
    expect(mapTour).toBe("trilha-gamboa");
    expect(view.controller.getState().tourId).toBe("trilha-gamboa");
  });
});
