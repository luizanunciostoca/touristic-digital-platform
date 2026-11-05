# Build and run on the same maintained musl ABI. The distro Node build uses
# shared zlib; zlib 1.3.2-r1 includes upstream fix df84af25dc1942490e1d1c899a07619152a46148.
FROM alpine:3.22@sha256:2e0b81d60597f449baa56dc25d355367869d2dca4cd57e866f1e2b52af3eb55f AS runtime-source
RUN apk add --no-cache \
    ada-libs=2.9.2-r4 \
    alpine-baselayout-data=3.7.0-r0 \
    alpine-keys=2.5-r0 \
    alpine-release=3.22.8-r0 \
    brotli-libs=1.1.1-r0 \
    c-ares=1.34.9-r0 \
    ca-certificates-bundle=20261020-r0 \
    icu-data-full=76.1-r1 \
    icu-libs=76.1-r1 \
    libcrypto3=3.5.9-r0 \
    libgcc=14.2.0-r6 \
    libssl3=3.5.9-r0 \
    libstdc++=14.2.0-r6 \
    musl=1.2.5-r13 \
    nghttp2-libs=1.69.0-r0 \
    nodejs=22.23.4-r0 \
    simdjson=3.12.0-r0 \
    simdutf=7.2.1-r0 \
    sqlite-libs=3.49.2-r1 \
    tzdata=2026f-r0 \
    zlib=1.3.2-r1 \
    zstd-libs=1.5.7-r0

# Retain complete selected package payloads and their genuine installed records.
# Installer utilities remain in this build stage, outside the final runtime.
FROM runtime-source AS runtime-root
COPY tooling/quality/runtime-image-composition.mjs /runtime-image-composition.mjs
RUN ["node", "/runtime-image-composition.mjs", "compose", "/runtime-root"]

FROM runtime-source AS base
RUN apk add --no-cache npm && npm install --global pnpm@10.15.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json eslint.config.mjs ./
COPY packages/ packages/
COPY services/ services/
COPY apps/ apps/
COPY dashboard/ dashboard/
COPY tooling/ tooling/
COPY tests/ tests/
RUN pnpm install --frozen-lockfile

FROM base AS development
ENV NODE_ENV=development
EXPOSE 3000 3001 3002
CMD ["pnpm", "dev"]

FROM base AS build
ENV NODE_ENV=production
RUN pnpm build && pnpm install --frozen-lockfile --prod

# Shellless nonroot runtime with the same Node and shared libraries as the build.
# The unchanged security/release workflows scan the complete image and its digest.
FROM scratch AS production
COPY --from=runtime-root /runtime-root /
WORKDIR /app
ARG MORRO_RELEASE_SHA=unknown
ARG MORRO_RELEASE_VERSION=unknown
ARG MORRO_RELEASE_IMAGE_RUN_ID=unknown
ENV NODE_ENV=production \
    MORRO_RELEASE_SHA=$MORRO_RELEASE_SHA \
    MORRO_RELEASE_VERSION=$MORRO_RELEASE_VERSION \
    MORRO_RELEASE_IMAGE_RUN_ID=$MORRO_RELEASE_IMAGE_RUN_ID
COPY --from=build --chown=65532:65532 /app /app
USER 65532:65532
RUN ["/nodejs/bin/node", "/app/tooling/quality/runtime-image-composition.mjs", "verify"]
EXPOSE 3000
ENTRYPOINT ["/nodejs/bin/node"]
CMD ["apps/morro-digital-platform/tooling/dev-server.mjs"]
