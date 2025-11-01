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
RUN apk add --no-cache \
    git=~2.49.1-r0 \
    bash=~5.2.37-r0 \
    docker-cli=~28.3.3-r3 \
    docker-cli-compose=~2.36.2-r3 \
    curl=~8.14.1-r2 \
    android-tools=~35.0.2-r14 \
    \
    autoconf=~2.72-r1 \
    automake=~1.17-r1 \
    zlib-dev=~1.3.1-r2 \
    libpng-dev=~1.6.47-r0 \
    build-base=~0.5-r3 \
    vips-dev=~8.16.1-r0 \
    python3-dev=~3.12.12-r0 \
    py3-setuptools=~80.9.0-r0 \
    py3-pip=~25.1.1-r0 \
    libssl3=~3.5.4-r0

# Copy package.json and pnpm-lock.yaml for installing dependencies
COPY package.json pnpm-lock.yaml .npmrc ./
ENV NODE_ENV=production

# Install pnpm
# Randomly, some of the "build-time" dependencies are being omitted by pnpm when it collects dependencies.
# I manually install them here. Even in the generated pnpm-lock.yaml, they are present...
RUN npm install -g pnpm@8.15.5 \
    -g node-gyp-build@4.8.4 \
    -g prisma@5.16.1 \
    -g napi-postinstall@0.3.4

# Install project dependencies
# The weirdness of this one file building like a monolithic project separate of the monorepo 
# exists because this project was bolted into a monorepo when building apks in parallel in the project became neccesary
# NODE_ENV is unset during install-time because pnpm needs to install both regular dependencies and devDependencies for the build
RUN NODE_ENV= pnpm install --frozen-lockfile

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
