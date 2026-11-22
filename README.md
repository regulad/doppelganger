# Doppelganger

Virtual Android phones in the cloud, used from any browser. It runs at
[doppelgangerhq.com](https://doppelgangerhq.com).

Each phone is a [redroid](https://github.com/remote-android/redroid-doc)
container: Android in Docker, on the host's own kernel. The web app starts and
manages the containers through Docker, and streams each screen to the browser
with [scrcpy](https://github.com/Genymobile/scrcpy). The browser decodes the
H.264 stream in a web worker and sends input back over adb.

## What's here

- **`apps/web`:** the web app. Next.js, with a custom Node server for the
  WebSocket proxies to scrcpy and adb. Accounts are Supabase's, data is in
  PostgreSQL through Prisma, subscriptions go through Stripe, notifications
  through OneSignal, and errors and traces to Sentry.
  - `server/src/device-info/`: the catalog of Android images a phone can run,
    and which of them are free ([its README](apps/web/server/src/device-info/README.md)).
    [regulad/redroid-script](https://github.com/regulad/redroid-script)'s `ci`
    branch builds the images reproducibly.
  - `workers/`: the H.264 decoder that runs in the browser.
- **`pheidippides/`:** the three companion apps installed on every phone:
  - **Locate** gives the phone the browser's location, as a mock location
    provider.
  - **Notify** relays the phone's notifications to the web app, which pushes
    them to the user.
  - **Administrate** is the phone's device admin, so that the web app can lock
    an app on it.
- **`scripts/`:** the checks that the git hook and CI run, such as
  `verify-clean-commit.sh`.

## Running it

`docker-compose.yml` is the production stack: the web image
(`ghcr.io/regulad/doppelganger:web-latest`), a cron container that calls
`/api/cron` every minute, and Redis. The web container gets the host's Docker
socket, to start the phones, and `/opt/doppelganger`, where their data lives.
It reads its settings from `.env.local`; `.env.local.example` lists them.

CI builds the image and the Pheidippides APKs on every push to `master`, and
deploys the result. [regulad/homelab](https://github.com/regulad/homelab) sets
up the production host.

## Building

The workspace uses pnpm (8.15.5, from `packageManager`) and Turborepo, with one
lockfile, the root `pnpm-lock.yaml`. The `apps/web` image installs from it, so
build the image from the repository's root, `docker build -f apps/web/Dockerfile .`,
as `docker-compose.yml` and CI do. The root `.dockerignore` keeps the build
context to the web app and the workspace's manifests.

`scripts/verify-clean-commit.sh` checks that `pnpm-lock.yaml` is in step with
every `package.json` in the workspace, by installing from a copy of them with
`--frozen-lockfile`. The git hook and CI both run it.

On a Mac, the build needs `flock` (`brew install flock`).

`apps/web/Dockerfile` isn't linted or verified, so test a change to it locally
before pushing.

## License

Copyright (C) 2024-2025 Nefum LLC

Copyright (C) 2025-2026 Parker Wahle

Doppelganger is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

It is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See [LICENSE](LICENSE) for the full text.

Third-party code and assets in this repository keep their own licenses; [NOTICE](NOTICE) lists them.
