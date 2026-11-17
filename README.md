## Building requirements

Mac build dependencies (from `brew`):

- `flock`

## Building notes

The workspace has one lockfile, the root `pnpm-lock.yaml`. The `Dockerfile` for `apps/web` installs from it, so the image is built from the repository's root: `docker build -f apps/web/Dockerfile .`, as `docker-compose.yml` and CI do. The root `.dockerignore` keeps the build context to the web app and the workspace's manifests.

`scripts/verify-clean-commit.sh` checks that `pnpm-lock.yaml` is in step with every `package.json` in the workspace, by installing from a copy of them with `--frozen-lockfile`. The git hook and CI both run it.

The `Dockerfile` for `apps/web` is not linted and not verified. Please edit it with caution and test offline before pushing.

## License

Copyright (C) 2024-2026 Parker Wahle and Nefum LLC

Doppelganger is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

It is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See [LICENSE](LICENSE) for the full text.

Third-party code and assets in this repository keep their own licenses; [NOTICE](NOTICE) lists them.
