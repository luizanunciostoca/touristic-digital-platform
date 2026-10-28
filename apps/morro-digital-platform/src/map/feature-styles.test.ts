import { describe, expect, it, vi } from "vitest";
import { installPublicOnboarding } from "../onboarding/public-onboarding.js";
import * as dialog from "../onboarding/public-onboarding-dialog.js";
import * as tour from "../onboarding/public-interactive-tour.js";
import {
  createFeatureStyleGate,
  ensureFeatureStyles,
} from "./feature-styles.js";

const featurePath =
  "/apps/morro-digital-platform/public/dist/entry-css/features.css";

function fixture(enabled = true): Document {
  const nodes: FakeNode[] = [];
  const keys = new Map<string, Set<EventListener>>();
  class FakeNode {
    dataset: Record<string, string> = {};
    attributes: Record<string, string> = {};
    style = { cssText: "" };
    disabled = false;
    isConnected = true;
    sheet: unknown = null;
    rel = "";
    media = "";
    href = "";
    textContent = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(readonly tag: string) {}
    dispatchEvent(event: Event): boolean {
      if (event.type === "load") this.onload?.();
      if (event.type === "error") this.onerror?.();
      return true;
    }
    setAttribute(name: string, value: string): void {
      this.attributes[name] = value;
    }
    after(node: FakeNode): void {
      nodes.splice(nodes.indexOf(this) + 1, 0, node);
    }
    remove(): void {
      nodes.splice(nodes.indexOf(this), 1);
      this.isConnected = false;
    }
  }
  if (enabled) {
    const entry = new FakeNode("link");
    entry.dataset.entryCss = "";
    entry.dataset.featureCss = featurePath;
    nodes.push(entry);
  }
  return {
    baseURI: "https://morro.example/",
    documentElement: { lang: "pt-BR" },
    defaultView: { Event },
    addEventListener: (type: string, listener: EventListener) => {
      if (!keys.has(type)) keys.set(type, new Set());
      keys.get(type)!.add(listener);
    },
    removeEventListener: (type: string, listener: EventListener) =>
      keys.get(type)?.delete(listener),
    dispatchEvent: (event: Event) => {
      for (const listener of [...(keys.get(event.type) ?? [])]) listener(event);
      return true;
    },
    body: { append: (node: FakeNode) => nodes.push(node) },
    createElement: (tag: string) => new FakeNode(tag),
    querySelector(selector: string) {
      if (selector === "link[data-entry-css]")
        return nodes.find((n) => "entryCss" in n.dataset) ?? null;
      if (selector === 'link[data-feature-css="true"]')
        return nodes.find((n) => n.dataset.featureCss === "true") ?? null;
      if (selector === "[data-feature-style-status]")
        return (
          nodes.find((n) => n.dataset.featureStyleStatus === "true") ?? null
        );
      if (selector === '[role="alert"]')
        return nodes.find((n) => n.attributes.role === "alert") ?? null;
      throw new Error("Unexpected DOM selector: " + selector);
    },
    querySelectorAll: (selector: string) =>
      nodes.filter((node) => node.tag === selector),
  } as unknown as Document;
}
const entry = (document: Document) =>
  document.querySelector<HTMLLinkElement>("link[data-entry-css]")!;
const feature = (document: Document) =>
  document.querySelector<HTMLLinkElement>('link[data-feature-css="true"]')!;
function loaded(document: Document): HTMLLinkElement {
  const link = feature(document);
  Object.defineProperty(link, "sheet", { value: {}, configurable: true });
  link.dispatchEvent(new document.defaultView!.Event("load"));
  return link;
}

describe("feature stylesheet loading", () => {
  it("Escape cancels a pending intent before any panel becomes visible", async () => {
    const document = fixture();
    const gate = createFeatureStyleGate(document);
    const action = vi.fn();
    gate.run(action);
    document.dispatchEvent(
      Object.assign(new Event("keydown"), { key: "Escape" }),
    );
    loaded(document);
    await Promise.resolve();
    expect(action).not.toHaveBeenCalled();
    gate.run(action);
    expect(action).toHaveBeenCalledOnce();
  });
  it.each(["Escape", "error"])(
    "notifies a pending controller once after %s, even with reentrant close",
    async (reason) => {
      const document = fixture();
      const gate = createFeatureStyleGate(document);
      const action = vi.fn();
      let expanded = true;
      const close = vi.fn(() => {
        expanded = false;
        gate.cancel();
      });
      gate.run(action, close);
      if (reason === "Escape") {
        document.dispatchEvent(
          Object.assign(new Event("keydown"), { key: "Escape" }),
        );
        loaded(document);
      } else {
        feature(document).dispatchEvent(
          new document.defaultView!.Event("error"),
        );
      }
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(expanded).toBe(false);
      expect(close).toHaveBeenCalledOnce();
      expect(action).not.toHaveBeenCalled();
      gate.cancel();
      expect(close).toHaveBeenCalledOnce();
    },
  );
  it("does not notify cancellation after successful publication", async () => {
    const document = fixture();
    const gate = createFeatureStyleGate(document);
    const action = vi.fn(),
      close = vi.fn();
    gate.run(action, close);
    loaded(document);
    await Promise.resolve();
    gate.cancel();
    expect(action).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
  });
  it("preserves synchronous legacy behavior without an entry marker", () => {
    const document = fixture(false);
    const action = vi.fn();
    createFeatureStyleGate(document).run(action);
    expect(action).toHaveBeenCalledOnce();
    expect(document.querySelectorAll("link")).toHaveLength(0);
  });
  it("deduplicates concurrent intent and switches the cascade only after load", async () => {
    const document = fixture();
    const first = ensureFeatureStyles(document)!;
    expect(ensureFeatureStyles(document)).toBe(first);
    expect(entry(document).disabled).toBeFalsy();
    expect(document.querySelectorAll("link")).toHaveLength(2);
    const link = loaded(document);
    await first;
    expect(link.media).toBe("all");
    expect(entry(document).disabled).toBe(true);
    expect(ensureFeatureStyles(document)).toBeNull();
  });
  it("keeps the entry usable after failure and permits a new intent to retry", async () => {
    const document = fixture();
    const pending = ensureFeatureStyles(document)!;
    const rejected = expect(pending).rejects.toThrow("UNAVAILABLE");
    feature(document).dispatchEvent(new document.defaultView!.Event("error"));
    await rejected;
    expect(entry(document).disabled).toBeFalsy();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Tente novamente",
    );
    const retry = ensureFeatureStyles(document)!;
    loaded(document);
    await retry;
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });
  it("cancels stale actions after close or destroy and keeps only the latest intent", async () => {
    const document = fixture();
    const gate = createFeatureStyleGate(document);
    const stale = vi.fn(),
      current = vi.fn();
    gate.run(stale);
    gate.cancel();
    gate.run(current);
    const pending = ensureFeatureStyles(document)!;
    loaded(document);
    await pending;
    expect(stale).not.toHaveBeenCalled();
    expect(current).toHaveBeenCalledOnce();
  });
  it("rejects cross-origin targets before requesting a stylesheet", async () => {
    const document = fixture();
    entry(document).dataset.featureCss = "https://other.example" + featurePath;
    await expect(ensureFeatureStyles(document)).rejects.toThrow(
      "TARGET_INVALID",
    );
    expect(document.querySelectorAll("link")).toHaveLength(1);
  });
  it("fails a nominal load without a stylesheet and times out stalled requests", async () => {
    vi.useFakeTimers();
    try {
      const document = fixture();
      const pending = ensureFeatureStyles(document)!;
      const rejected = expect(pending).rejects.toThrow("UNAVAILABLE");
      feature(document).dispatchEvent(new document.defaultView!.Event("load"));
      await rejected;
      const retry = ensureFeatureStyles(document)!;
      const timedOut = expect(retry).rejects.toThrow("UNAVAILABLE");
      await vi.advanceTimersByTimeAsync(12000);
      await timedOut;
      expect(entry(document).disabled).toBeFalsy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("onboarding feature-style retry integration", () => {
  it("keeps Start usable after a stylesheet load failure", async () => {
    const document = fixture();
    const button = Object.assign(new EventTarget(), { focus() {} });
    const overlay = {
      querySelector: (selector: string) =>
        selector.includes('"start"') ? button : null,
      remove() {},
    } as unknown as HTMLElement;
    Object.assign(document.body, {
      setAttribute() {},
      removeAttribute() {},
      appendChild() {},
    });
    const start = vi.fn(() => true);
    const mocks = [
      vi.spyOn(dialog, "createPublicOnboardingDialog").mockReturnValue(overlay),
      vi
        .spyOn(dialog, "activatePublicOnboardingDialogHost")
        .mockReturnValue({} as dialog.PublicOnboardingDialogHostSnapshot),
      vi
        .spyOn(dialog, "restorePublicOnboardingDialogHost")
        .mockImplementation(() => {}),
      vi
        .spyOn(tour, "installPublicInteractiveTour")
        .mockReturnValue({ active: false, stepIndex: 0, start, destroy() {} }),
    ];
    const controller = installPublicOnboarding({
      document,
      storage: { getItem: () => null, setItem() {} },
    });
    try {
      expect(controller.showIfNeeded()).toBe(true);
      button.dispatchEvent(new Event("click"));
      const pending = ensureFeatureStyles(document)!;
      const rejected = expect(pending).rejects.toThrow("UNAVAILABLE");
      feature(document).dispatchEvent(new Event("error"));
      await rejected;
      await Promise.resolve();
      expect(controller.state).toBe("not_started");
      expect(start).not.toHaveBeenCalled();
      button.dispatchEvent(new Event("click"));
      expect(feature(document)).not.toBeNull();
      const retry = ensureFeatureStyles(document)!;
      button.dispatchEvent(new Event("click"));
      expect(ensureFeatureStyles(document)).toBe(retry);
      loaded(document);
      await retry;
      expect(controller.state).toBe("in_progress");
      expect(start).toHaveBeenCalledOnce();
    } finally {
      controller.destroy();
      mocks.forEach((mock) => mock.mockRestore());
    }
  });
});
