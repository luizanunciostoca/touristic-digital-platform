FROM node:22.23.2-trixie-slim AS base

# Install the workspace package manager only in build-oriented stages.
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

WORKDIR /app

# Copy workspace files.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json eslint.config.mjs ./
COPY packages/ packages/
COPY services/ services/
COPY apps/ apps/
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

# Production stage: current Debian 13 runtime, patched OS packages, no package
# managers, and no root process. Keeping build tooling out of this stage avoids
# shipping npm/pnpm dependency trees that are not part of the application.
FROM node:22.23.2-trixie-slim AS production
WORKDIR /app
ENV NODE_ENV=production

RUN set -eux; \
    apt-get update; \
    apt-get upgrade -y; \
    apt-get clean; \
    rm -rf /var/lib/apt/lists/* \
      /usr/local/lib/node_modules/npm \
      /usr/local/lib/node_modules/corepack \
      /opt/yarn-*; \
    rm -f /usr/local/bin/npm \
      /usr/local/bin/npx \
      /usr/local/bin/corepack \
      /usr/local/bin/pnpm \
      /usr/local/bin/pnpx \
      /usr/local/bin/yarn \
      /usr/local/bin/yarnpkg

COPY --from=build --chown=node:node /app /app

USER node

EXPOSE 3000
CMD ["node", "apps/morro-digital-platform/dist/browser-entry.js"]
