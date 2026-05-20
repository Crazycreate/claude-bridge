# Multi-stage build: smaller final image, no dev deps shipped.
#
# Build:  docker build -t mobileai .
# Run:    see docker-compose.yml

# ---- stage 1: build the frontend ----------------------------------------------
FROM node:20-alpine AS web
WORKDIR /app

# Copy manifests first so npm install can be cached when source changes
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY frontend/package.json ./frontend/
RUN npm install --no-audit --no-fund

# Now the source and build
COPY shared ./shared
COPY frontend ./frontend
COPY server ./server
RUN npm run build:web

# ---- stage 2: prune to production deps ---------------------------------------
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
RUN npm install --omit=dev --no-audit --no-fund --workspaces=false \
 && cd server && npm install --omit=dev --no-audit --no-fund

# ---- stage 3: final runtime image --------------------------------------------
FROM node:20-alpine
WORKDIR /app

# git is needed for the per-session topbar pill (branch + dirty count)
RUN apk add --no-cache git tini

# Copy production-only deps and the built artifacts
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/server/node_modules ./server/node_modules
COPY --from=web /app/shared ./shared
COPY --from=web /app/server ./server
COPY --from=web /app/frontend/dist ./frontend/dist
COPY package.json ./

# Where the bridge persists session JSONs (mount a volume here to keep them)
ENV HOME=/data
RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 8787
ENV NODE_ENV=production
ENV PORT=8787

# tini reaps zombies and forwards signals — important for the SDK child process
ENTRYPOINT ["/sbin/tini", "--", "node", "--enable-source-maps"]
CMD ["server/node_modules/tsx/dist/cli.mjs", "server/src/index.ts"]
