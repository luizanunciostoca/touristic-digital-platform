export type ResponsiveImageFormat = "image/avif" | "image/webp";

export interface ResponsiveImageCandidate {
  readonly src: string;
  readonly width: number;
}

export interface ResponsiveImageSource {
  readonly type: ResponsiveImageFormat;
  readonly candidates: readonly ResponsiveImageCandidate[];
}

export interface ResponsiveImageDescriptor {
  readonly fallbackSrc: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
  readonly sizes: string;
  readonly sources?: readonly ResponsiveImageSource[];
  readonly loading?: "eager" | "lazy";
  readonly fetchPriority?: "high" | "low" | "auto";
  readonly className?: string;
}

function assertPositiveDimension(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Responsive image ${field} must be a positive integer.`);
  }
}

function normalizePath(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Responsive image ${field} is required.`);
  }
  return normalized;
}

export function createResponsiveSrcSet(
  candidates: readonly ResponsiveImageCandidate[],
): string {
  if (candidates.length === 0) {
    throw new Error("Responsive image source requires at least one candidate.");
  }

  const seenWidths = new Set<number>();
  return [...candidates]
    .sort((left, right) => left.width - right.width)
    .map(({ src, width }) => {
      assertPositiveDimension(width, "candidate width");
      if (seenWidths.has(width)) {
        throw new Error(`Duplicate responsive image width: ${width}.`);
      }
      seenWidths.add(width);
      return `${normalizePath(src, "candidate src")} ${width}w`;
    })
    .join(", ");
}

export function createResponsivePicture(
  document: Document,
  descriptor: ResponsiveImageDescriptor,
): HTMLPictureElement {
  const fallbackSrc = normalizePath(descriptor.fallbackSrc, "fallback src");
  const alt = descriptor.alt.trim();
  const sizes = normalizePath(descriptor.sizes, "sizes");
  assertPositiveDimension(descriptor.width, "width");
  assertPositiveDimension(descriptor.height, "height");

  const picture = document.createElement("picture");

  for (const sourceDescriptor of descriptor.sources ?? []) {
    const source = document.createElement("source");
    source.type = sourceDescriptor.type;
    source.srcset = createResponsiveSrcSet(sourceDescriptor.candidates);
    source.sizes = sizes;
    picture.appendChild(source);
  }

  const image = document.createElement("img");
  image.src = fallbackSrc;
  image.alt = alt;
  image.width = descriptor.width;
  image.height = descriptor.height;
  image.sizes = sizes;
  image.loading = descriptor.loading ?? "lazy";
  image.decoding = "async";
  image.fetchPriority = descriptor.fetchPriority ?? "auto";
  if (descriptor.className) image.className = descriptor.className;

  picture.appendChild(image);
  return picture;
}
