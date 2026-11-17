#!/bin/bash
# Checks that pnpm-lock.yaml, the workspace's one lockfile, which CI and the
# Docker image install from with --frozen-lockfile, is in step with every
# package.json in the workspace. It installs from a copy of the manifests and
# the lockfile with the pinned pnpm, so nothing in the working tree is touched.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
# the pnpm the Dockerfile installs, as pinned in packageManager (pnpm@x.y.z)
pnpm="$(node -p 'require(process.argv[1]).packageManager' "$root/package.json")"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cd "$root"
# The root's files and each project's package.json, by pnpm-workspace.yaml's
# globs
for manifest in package.json pnpm-workspace.yaml pnpm-lock.yaml \
  apps/*/package.json packages/*/package.json pheidippides/*/package.json; do
  if [ -f "$manifest" ]; then
    mkdir -p "$tmp/$(dirname "$manifest")"
    cp "$manifest" "$tmp/$manifest"
  fi
done

if ! (cd "$tmp" && npx -y "$pnpm" install --frozen-lockfile --lockfile-only --ignore-scripts) > "$tmp/install.log" 2>&1; then
  cat "$tmp/install.log" >&2
  echo "pnpm-lock.yaml doesn't match the workspace's package.json files. Update it with \`pnpm install\`." >&2
  exit 1
fi
