# Use an official Node runtime as a parent image
FROM node:22-alpine3.22

# Set the working directory in the container
WORKDIR /usr/src/app

# Install system dependencies
# Used by:
#   - node-canvas
#   - docker cli calls (dockerode-compose sucks)
#   - bufferutil
RUN apk add --no-cache \
    build-base \
    autoconf \
    automake \
    zlib-dev \
    libpng-dev \
    nasm \
    bash \
    vips-dev \
    docker-cli \
    curl \
    android-tools \
    python3 python3-dev \
    py3-setuptools py3-pip \
    git

# Install docker-compose plugin for deployment
RUN mkdir -p /usr/local/lib/docker/cli-plugins && \
    ARCH=$(uname -m) && \
    case ${ARCH} in \
        x86_64) COMPOSE_ARCH="x86_64" ;; \
        aarch64) COMPOSE_ARCH="aarch64" ;; \
        armv7l) COMPOSE_ARCH="armv7" ;; \
        *) echo "Unsupported architecture: ${ARCH}"; exit 1 ;; \
    esac && \
    curl -SL "https://github.com/docker/compose/releases/download/v2.28.0/docker-compose-linux-${COMPOSE_ARCH}" -o /usr/local/lib/docker/cli-plugins/docker-compose && \
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

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

# Build database client
RUN pnpm run db:generate

# provide sentry for the server
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_RELEASE
ENV SENTRY_ORG=nefum
ENV SENTRY_PROJECT=doppelganger-server

# Build the server-side code
RUN pnpm run server:build && unset SENTRY_AUTH_TOKEN && unset SENTRY_RELEASE && unset SENTRY_ORG && unset SENTRY_PROJECT

# Generate licenses
RUN pnpm run licenses:check

# Build static workers
RUN pnpm run workers:build

# Provide public (NEXT_PUBLIC_) environment variables
RUN cp .env.local.public .env.local

# Use ARG to accept the token during build
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_RELEASE
ENV SENTRY_ORG=nefum
ENV SENTRY_PROJECT=doppelganger-front

# Build the application
RUN NODE_OPTIONS="--max-old-space-size=4096" SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN SENTRY_RELEASE=$SENTRY_RELEASE pnpm run build && unset SENTRY_AUTH_TOKEN && unset SENTRY_RELEASE && unset SENTRY_ORG && unset SENTRY_PROJECT

# Expose the port the app runs on
EXPOSE 3000

# Define the command to run the app
CMD ["pnpm", "run", "start"]
