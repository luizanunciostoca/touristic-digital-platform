import type { MapboxGlModuleLike } from "@touristic/geospatial";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MAPBOX_SDK_TIMEOUT_MS,
  MAPBOX_GL_SCRIPT_URL,
  MAPBOX_GL_STYLE_URL,
  loadMapboxGlSdk,
  type MapboxLoaderDocument,
  type MapboxLoaderWindow,
} from "./mapbox-sdk-loader.js";

function createSdk(): MapboxGlModuleLike {
  return {
    accessToken: "",
    Map: class {
      setCenter(): void {}
      remove(): void {}
    },
    Marker: class {
      setLngLat(): this {
        return this;
      }
      addTo(): this {
        return this;
      }
      remove(): void {}
    },
  };
}

function createFixture() {
  let timeoutHandler: (() => void) | undefined;
  const appended: Array<Record<string, unknown>> = [];
  const script = {
    src: "",
    async: false,
    dataset: {} as Record<string, string | undefined>,
    onload: null as (() => void) | null,
    onerror: null as (() => void) | null,
    remove: vi.fn(),
  };
  const link = {
    rel: "",
    href: "",
    dataset: {} as Record<string, string | undefined>,
  };
  const document = {
    head: {
      appendChild(node: unknown) {
        appended.push(node as Record<string, unknown>);
        return node;
      },
    },
    createElement(tagName: string) {
      return tagName === "script" ? script : link;
    },
    querySelector: () => null,
  } as unknown as MapboxLoaderDocument;
  const window = {
    setTimeout(handler: () => void) {
      timeoutHandler = handler;
      return 1;
    },
    clearTimeout: vi.fn(),
  } as unknown as MapboxLoaderWindow;

  return {
    appended,
    document,
    link,
    script,
    window,
    runTimeout: () => timeoutHandler?.(),
  };
}

describe("loadMapboxGlSdk", () => {
  it("reuses an SDK that is already available", async () => {
    const fixture = createFixture();
    const sdk = createSdk();
    fixture.window.mapboxgl = sdk;

    await expect(
      loadMapboxGlSdk({ document: fixture.document, window: fixture.window }),
    ).resolves.toBe(sdk);

    expect(fixture.appended).toHaveLength(0);
  });

  it("loads the official script and stylesheet", async () => {
    const fixture = createFixture();
    const sdk = createSdk();
    const promise = loadMapboxGlSdk({
      document: fixture.document,
      window: fixture.window,
    });

    expect(fixture.link.href).toBe(MAPBOX_GL_STYLE_URL);
    expect(fixture.script.src).toBe(MAPBOX_GL_SCRIPT_URL);
    fixture.window.mapboxgl = sdk;
    fixture.script.onload?.();

    await expect(promise).resolves.toBe(sdk);
  });

  it("rejects SDK network failures", async () => {
    const fixture = createFixture();
    const promise = loadMapboxGlSdk({
      document: fixture.document,
      window: fixture.window,
    });
    fixture.script.onerror?.();

    await expect(promise).rejects.toThrow("Mapbox GL JS failed to load.");
    expect(fixture.script.remove).toHaveBeenCalledOnce();
  });

  it("times out and removes the pending script", async () => {
    const fixture = createFixture();
    const promise = loadMapboxGlSdk({
      document: fixture.document,
      window: fixture.window,
    });
    fixture.runTimeout();

    await expect(promise).rejects.toThrow(
      `Mapbox GL JS loading timed out after ${DEFAULT_MAPBOX_SDK_TIMEOUT_MS}ms.`,
    );
    expect(fixture.script.remove).toHaveBeenCalledOnce();
  });
});
