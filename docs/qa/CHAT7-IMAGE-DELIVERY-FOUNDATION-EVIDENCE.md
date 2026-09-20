# Chat 7 — Image Delivery Foundation Evidence

## Scope

This wave establishes the runtime contract for responsive image delivery without fabricating AVIF/WebP files that do not exist in the repository.

## Verified current state

The public Morro Digital runtime currently relies primarily on PNG/JPG assets.

The Assistant mood icon at:

`/apps/morro-digital-platform/public/assets/emojis/sun_emojis/sun_emoji_1.png`

was verified from the GitHub blob as a 341×341 PNG.

The Assistant photo carousel currently resolves legacy JPG place photos and already uses eager loading for the first requested photo and lazy loading for subsequent photos.

## Responsive image contract

`createResponsivePicture` supports:

- AVIF sources;
- WebP sources;
- width-descriptor `srcset`;
- canonical `sizes`;
- mandatory fallback image;
- intrinsic width/height;
- eager/lazy loading;
- async decoding;
- fetch priority.

Modern formats are emitted only when the caller supplies real variant assets. The helper never derives or invents a `.webp` or `.avif` URL from a JPG/PNG path.

## Runtime improvements

The always-visible Assistant mood image now carries its verified intrinsic dimensions and async decoding metadata, reducing layout ambiguity.

The Assistant photo carousel now supplies a responsive `sizes` hint and explicit fetch priority: the first on-demand photo is prioritized, while later photos remain lazy and automatic priority.

## Remaining production media work

This foundation does not claim that the current JPG/PNG media library has already been transcoded.

A later media pipeline/CMS integration must:

1. create real AVIF/WebP derivatives;
2. record their actual dimensions;
3. expose verified variant metadata;
4. feed those variants into the responsive image contract;
5. preserve the original as fallback;
6. verify visual quality and file-size benefit before publication.

No fake source URL is acceptable.
