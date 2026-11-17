# Use an official Node runtime as a parent image
FROM node:22-alpine3.22

# The image is built from the repository's root (the root .dockerignore keeps
# the context to the web app and the workspace's manifests), so it can install
# from the workspace's one lockfile. The app sits at apps/web below the
# workspace's root, as in the repository.
WORKDIR /usr/src/app/apps/web

# Install system dependencies
# Used by:
#   - node-canvas
#   - docker cli calls (dockerode-compose sucks)
#   - bufferutil
#   - prisma
# Empty line delineates direct deps from transitive deps
# Pinned to the minor version only: Alpine keeps just the newest build of each
# package, so a full pin (=~3.5.4-r0) stops resolving at its next security fix.
RUN apk add --no-cache \
    git=~2.49 \
    bash=~5.2 \
    docker-cli=~28.3 \
    docker-cli-compose=~2.36 \
    curl=~8.14 \
    android-tools=~35.0 \
    \
    autoconf=~2.72 \
    automake=~1.17 \
    zlib-dev=~1.4 \
    libpng-dev=~1.6 \
    build-base=~0.5 \
    vips-dev=~8.16 \
    python3-dev=~3.12 \
    py3-setuptools=~80.9 \
    py3-pip=~25.1 \
    openssl=~3.5

# Install pnpm
# Randomly, some of the "build-time" dependencies are being omitted by pnpm when it collects dependencies.
# I manually install them here. Even in the generated pnpm-lock.yaml, they are present...
RUN npm install -g pnpm@8.15.5 \
    -g node-gyp-build@4.8.4 \
    -g napi-postinstall@0.3.4

# Native addons build against this image's own Node headers, rather than
# headers node-gyp downloads from unofficial-builds.nodejs.org at install time
ENV npm_config_nodedir=/usr/local

# The third-party APKs installed on every device, checked against pinned
# hashes. Fetched before the app is copied in, so this layer is reused until
# the script changes.
COPY apps/web/scripts/download-android-apps.sh scripts/
RUN bash scripts/download-android-apps.sh android

# Install the web app's dependencies, and only its own (--filter web), from the
# workspace's lockfile, hoisted into the workspace root's node_modules.
# NODE_ENV is unset during install-time because pnpm needs to install both regular dependencies and devDependencies for the build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml /usr/src/app/
COPY apps/web/package.json ./
ENV NODE_ENV=production
# The pnpm store is a cache mount, so a changed lockfile downloads only what's new
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    cd /usr/src/app \
    && NODE_ENV= pnpm install --frozen-lockfile --filter web --shamefully-hoist

# Copy the rest of the application code
COPY apps/web/ ./

# Build the application
ARG SENTRY_RELEASE
# Kept for runtime too: the server's Sentry client is made before Next.js loads
# (see server/src/instrument.ts), so it can't see the release that Next's build
# injects, and reads SENTRY_RELEASE instead
ENV SENTRY_RELEASE=$SENTRY_RELEASE
# Next.js keeps its build cache in a cache mount, which CI carries between runs
RUN --mount=type=secret,id=sentry_token \
    --mount=type=cache,id=next-cache,target=/usr/src/app/apps/web/.next/cache \
    export NODE_OPTIONS="--max-old-space-size=4096" \
    && export SENTRY_AUTH_TOKEN=$(cat /run/secrets/sentry_token) \
    && export SENTRY_ORG=regulad \
    && export SENTRY_PROJECT=doppelganger \
    && cp .env.local.public .env.local \
    && pnpm run db:generate \
    && pnpm run server:build \
    && pnpm run licenses:check \
    && pnpm run workers:build \
    && pnpm run build

# Expose the port the app runs on
EXPOSE 3000

# The start script applies any pending database migrations (prisma migrate
# deploy, which reads DIRECT_URL from the runtime environment) and only then
# starts the server under pm2, so a failed migration keeps the app down rather
# than running it against the wrong schema
CMD ["pnpm", "run", "start"]
