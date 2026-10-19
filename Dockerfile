FROM node:22.23.2-trixie-slim AS base

# Install the workspace package manager only in build-oriented stages.
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

WORKDIR /app

# Copy workspace files.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json eslint.config.mjs ./
COPY packages/ packages/
COPY services/ services/
COPY apps/ apps/
COPY dashboard/ dashboard/
COPY tooling/ tooling/
COPY tests/ tests/

# Install full dependencies for build/test tooling.
RUN pnpm install --frozen-lockfile

# Development stage.
FROM base AS development
ENV NODE_ENV=development
EXPOSE 3000 3001 3002
CMD ["pnpm", "dev"]

# Build stage. Build first, then materialize only production dependencies so
# the final image does not need pnpm/Corepack at runtime.
FROM base AS build
ENV NODE_ENV=production
RUN pnpm build && pnpm install --frozen-lockfile --prod

# Production stage: no shell, package manager, login utilities, or root user.
# The upstream Node.js distroless Debian 13 image receives patched releases.
# CI scans the exact published image digest before release provenance is emitted.
FROM gcr.io/distroless/nodejs22-debian13:nonroot AS production
WORKDIR /app

ARG MORRO_RELEASE_SHA=unknown
ARG MORRO_RELEASE_VERSION=unknown
ARG MORRO_RELEASE_IMAGE_RUN_ID=unknown
ENV NODE_ENV=production \
    MORRO_RELEASE_SHA=$MORRO_RELEASE_SHA \
    MORRO_RELEASE_VERSION=$MORRO_RELEASE_VERSION \
    MORRO_RELEASE_IMAGE_RUN_ID=$MORRO_RELEASE_IMAGE_RUN_ID

# Node.js is the runtime entrypoint in distroless nodejs images.
COPY --from=build --chown=65532:65532 /app /app
USER 65532:65532
EXPOSE 3000
CMD ["apps/morro-digital-platform/tooling/dev-server.mjs"]
