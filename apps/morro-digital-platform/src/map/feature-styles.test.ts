import { describe, expect, it, vi } from "vitest";
import {
  createFeatureStyleGate,
  ensureFeatureStyles,
} from "./feature-styles.js";

const featurePath =
  "/apps/morro-digital-platform/public/dist/entry-css/features.css";

function fixture(enabled = true): Document {
  const nodes: FakeNode[] = [];
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
