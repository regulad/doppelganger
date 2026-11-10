# Use an official Node runtime as a parent image
FROM node:22-alpine3.22

# Set the working directory in the container
WORKDIR /usr/src/app

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

# Install project dependencies
# The weirdness of this one file building like a monolithic project separate of the monorepo 
# exists because this project was bolted into a monorepo when building apks in parallel in the project became neccesary
# NODE_ENV is unset during install-time because pnpm needs to install both regular dependencies and devDependencies for the build
COPY package.json pnpm-lock.yaml ./
ENV NODE_ENV=production
RUN NODE_ENV= pnpm install --frozen-lockfile --shamefully-hoist

# Copy the rest of the application code
COPY . .

# Build the application
ARG SENTRY_RELEASE
RUN --mount=type=secret,id=sentry_token \
    export NODE_OPTIONS="--max-old-space-size=4096" \
    && export SENTRY_AUTH_TOKEN=$(cat /run/secrets/sentry_token) \
    && export SENTRY_RELEASE=$SENTRY_RELEASE \
    && export SENTRY_ORG=nefum \
    && export SENTRY_PROJECT=doppelganger-front \
    && cp .env.local.public .env.local \
    && pnpm run db:generate \
    && pnpm run server:build \
    && pnpm run licenses:check \
    && pnpm run workers:build \
    && pnpm run build

# Expose the port the app runs on
EXPOSE 3000

# Define the command to run the app
CMD ["pnpm", "run", "start"]
