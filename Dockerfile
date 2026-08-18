FROM node:22-slim AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json eslint.config.mjs ./
COPY packages/ packages/
COPY services/ services/
COPY apps/ apps/
COPY tooling/ tooling/
COPY tests/ tests/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Development stage
FROM base AS development
ENV NODE_ENV=development
EXPOSE 3000 3001 3002
CMD ["pnpm", "dev"]

# Build stage
FROM base AS build
ENV NODE_ENV=production
RUN pnpm build

# Production stage
FROM node:22-slim AS production
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/packages/ packages/
COPY --from=build /app/services/ services/
COPY --from=build /app/apps/ apps/
COPY --from=build /app/tooling/ tooling/

RUN pnpm install --frozen-lockfile --prod

EXPOSE 3000
CMD ["node", "apps/morro-digital-platform/dist/browser-entry.js"]
