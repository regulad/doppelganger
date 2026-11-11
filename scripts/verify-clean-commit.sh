#!/bin/bash
# Checks that apps/web/pnpm-lock.yaml, the lockfile the Docker image installs
# from, is in step with apps/web/package.json. It installs from a copy of the
# two with --frozen-lockfile, as the Dockerfile does, so it fails exactly when
# the image build would. Nothing in the working tree is touched.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
# the pnpm the Dockerfile installs, as pinned in packageManager (pnpm@x.y.z)
pnpm="$(node -p 'require(process.argv[1]).packageManager' "$root/package.json")"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp "$root/apps/web/package.json" "$root/apps/web/pnpm-lock.yaml" "$tmp/"

if ! (cd "$tmp" && npx -y "$pnpm" install --frozen-lockfile --lockfile-only --ignore-scripts) > "$tmp/install.log" 2>&1; then
  cat "$tmp/install.log" >&2
  echo "apps/web/pnpm-lock.yaml doesn't match apps/web/package.json. Regenerate it with \`turbo run precommit\`." >&2
  exit 1
fi
