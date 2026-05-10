# ─── Stage 1: deps ────────────────────────────────────────────────────────────
# node:22-slim (Debian/glibc) is required — NOT alpine (musl).
# bcrypt ships prebuilt binaries only for glibc. On musl/alpine the native
# addon would need to be compiled from source, which requires python + make +
# gcc and is fragile. slim gives us a small image (~200 MB) without that risk.
# Node 22 is also required by pnpm@latest (v11+) which uses node:sqlite internally.
FROM node:22-slim AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace manifests first so Docker can cache the install layer
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json tsconfig.json ./

# Copy all package.json files (needed for workspace resolution)
COPY lib/db/package.json                lib/db/
COPY lib/api-zod/package.json           lib/api-zod/
COPY lib/api-spec/package.json          lib/api-spec/
COPY lib/api-client-react/package.json  lib/api-client-react/
COPY artifacts/api-server/package.json  artifacts/api-server/

RUN pnpm install --frozen-lockfile


# ─── Stage 2: build ───────────────────────────────────────────────────────────
FROM deps AS builder

COPY lib/db/src                         lib/db/src/
COPY lib/api-zod/src                    lib/api-zod/src/
COPY artifacts/api-server/src           artifacts/api-server/src/
COPY artifacts/api-server/build.mjs     artifacts/api-server/
COPY artifacts/api-server/tsconfig.json artifacts/api-server/

RUN pnpm --filter @workspace/api-server run build


# ─── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM node:22-slim AS runtime

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/db/package.json                lib/db/
COPY lib/api-zod/package.json           lib/api-zod/
COPY artifacts/api-server/package.json  artifacts/api-server/

# --prod installs only production deps; scripts ARE needed so bcrypt's native
# addon gets properly linked from the prebuilt binaries.
RUN pnpm install --frozen-lockfile --prod

# Copy the compiled bundle from the build stage
COPY --from=builder /app/artifacts/api-server/dist artifacts/api-server/dist/

# Drop root privileges
RUN groupadd --system appgroup && useradd --system --gid appgroup appuser
USER appuser

EXPOSE 8080
ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
