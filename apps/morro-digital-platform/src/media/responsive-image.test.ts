import { describe, expect, it } from "vitest";

import {
  createResponsivePicture,
  createResponsiveSrcSet,
} from "./responsive-image.js";

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly tagName: string;
  type = "";
  srcset = "";
  sizes = "";
  src = "";
  alt = "";
  width = 0;
  height = 0;
  loading = "";
  decoding = "";
  fetchPriority = "";
  className = "";

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }
}

const document = {
  createElement(tagName: string) {
    return new FakeElement(tagName);
  },
} as unknown as Document;

describe("responsive image srcset", () => {
  it("sorts real candidates by width", () => {
    expect(
      createResponsiveSrcSet([
        { src: "/photo-1280.webp", width: 1280 },
        { src: "/photo-640.webp", width: 640 },
      ]),
    ).toBe("/photo-640.webp 640w, /photo-1280.webp 1280w");
  });

  it("rejects duplicate widths and empty candidates", () => {
    expect(() => createResponsiveSrcSet([])).toThrow(
      "requires at least one candidate",
    );
    expect(() =>
      createResponsiveSrcSet([
        { src: "/a.webp", width: 640 },
        { src: "/b.webp", width: 640 },
      ]),
    ).toThrow("Duplicate responsive image width");
  });
});

describe("responsive picture", () => {
  it("orders modern formats before the mandatory fallback image", () => {
    const picture = createResponsivePicture(document, {
      fallbackSrc: "/photo.jpg",
      alt: "Segunda Praia",
      width: 1280,
      height: 853,
      sizes: "(max-width: 48rem) 100vw, 48rem",
      loading: "eager",
      fetchPriority: "high",
      className: "place-photo",
      sources: [
        {
          type: "image/avif",
          candidates: [
            { src: "/photo-640.avif", width: 640 },
            { src: "/photo-1280.avif", width: 1280 },
          ],
        },
        {
          type: "image/webp",
          candidates: [
            { src: "/photo-640.webp", width: 640 },
            { src: "/photo-1280.webp", width: 1280 },
          ],
        },
      ],
    }) as unknown as FakeElement;

    expect(picture.children.map((child) => child.tagName)).toEqual([
      "source",
      "source",
      "img",
    ]);
    expect(picture.children[0]).toMatchObject({
      type: "image/avif",
      srcset: "/photo-640.avif 640w, /photo-1280.avif 1280w",
    });
    expect(picture.children[1]).toMatchObject({
      type: "image/webp",
      srcset: "/photo-640.webp 640w, /photo-1280.webp 1280w",
    });
    expect(picture.children[2]).toMatchObject({
      src: "/photo.jpg",
      alt: "Segunda Praia",
      width: 1280,
      height: 853,
      loading: "eager",
      decoding: "async",
      fetchPriority: "high",
      className: "place-photo",
    });
  });

  it("does not invent modern sources when none exist", () => {
    const picture = createResponsivePicture(document, {
      fallbackSrc: "/legacy-only.jpg",
      alt: "Legacy photo",
      width: 800,
      height: 600,
      sizes: "100vw",
    }) as unknown as FakeElement;

    expect(picture.children).toHaveLength(1);
    expect(picture.children[0]?.tagName).toBe("img");
    expect(picture.children[0]?.loading).toBe("lazy");
  });
});
