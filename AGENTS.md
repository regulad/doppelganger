# AGENTS.md

## Fixing Sentry issues

Errors from the web app and the Pheidippides apps go to Sentry, in the
`regulad` organization. When a commit fixes one of these issues, give its
message one `Fixes <SHORT-ID>` line per issue. Put them in their own paragraph,
after the body and before any trailers:

```
Wait out a booting device instead of giving up in two seconds

...

Fixes DOPPELGANGER-D3
Fixes DOPPELGANGER-D6

Co-Authored-By: ...
```

The short ID is the one Sentry shows on the issue, such as `DOPPELGANGER-D7` or
`PHEIDIPPIDES-LOCATE-E`.

Sentry's GitHub integration reads these lines and links each issue to the
commit. The `sentry-release` jobs in `.github/workflows/ci-cd.yml` link each
master build's release to its commits. Once the fixing commit is in a release,
Sentry marks the issue resolved in that release:

- Errors from older builds still running don't reopen it.
- An error from the fixed build or a later one reopens it as a regression.

For a pull request that will be squash-merged, also put the lines in the PR
description.

A commit that adds instrumentation for an issue whose cause is unknown also
carries `Fixes <SHORT-ID>`, one commit per issue. Its body says that it adds
context, not a fix, so that a reopened issue points at it (Parker,
2026-11-21). A change that fixes no reported error gets no `Fixes` line. If a
fix was pushed without its line, tell Parker, who resolves the issue by hand.

An ANR issue from a restart outside a CI deploy is a starved startup (a
breadcrumb such as "Running next.config.mjs took 22.7s"), not a bug. Those are
archived until they escalate (2026-11-17). Change code only if one follows an
ordinary CI deploy, and first compare startup with the profiler on and off.

## Building locally

`next build` and `server:build` upload to production Sentry when they find
`~/.sentryclirc`. Run them as `HOME=<empty dir> SENTRY_AUTH_TOKEN= pnpm run …`.
`next build` prerenders with the Supabase env, so source
`apps/web/.env.local.public` first, as CI does. To build the image:
`podman build --secret id=sentry_token,src=<empty file> -f apps/web/Dockerfile .`

pnpm 8.15.5 (`packageManager`) skips `pre*` and `post*` scripts, so chain steps
with `&&`. Deleting `pnpm-lock.yaml` doesn't re-resolve it, because pnpm reads
`node_modules/.pnpm/lock.yaml`: use
`pnpm update -r --include-workspace-root --depth Infinity --no-save --lockfile-only`.
`server:build` bundles with pkgroll, which has no plugin hook, so the server
imports only what rollup reads natively (`.json`, not `.json5`).

## Running locally

A production-mode run reports to the real Sentry project. The DSN is
`NEXT_PUBLIC_SENTRY_DSN` in the committed `apps/web/.env.local.public`, Sentry
is on under `NODE_ENV=production`, and the browser tunnels through
`/monitoring`, so resolve `*.sentry.io` to an unroutable address for test runs.
In production mode the app hard-codes `redis:6379`: map `redis` to 127.0.0.1.
`postgres:16-alpine` passes `pg_isready` before its init restart, so retry
`prisma migrate deploy`. Never `import("./dist/index.mjs")` to smoke-test the
bundle, because it starts the server. pm2's sockets overflow the 108-character
limit under a long `PM2_HOME`, so test pm2 in the image
(`podman exec <ctr> node_modules/.bin/pm2 jlist`).

## Dependabot

A Dependabot PR you push to is yours to merge, since auto-merge runs only on
Dependabot's own pushes (`.github/workflows/dependabot-auto-merge.yml`). Squash
it with Dependabot's body, then your fix commit's message, then the trailers
(Dependabot's `Signed-off-by: dependabot[bot]`, then yours).
`gh pr merge --match-head-commit` needs the full SHA.

Dependabot can supersede the PR and delete its branch while you work: check
`gh pr view N --json state` and `git ls-remote` before pushing. A push to a
deleted branch recreates it, so delete it again and rebuild on the new PR.

A secret CI needs goes in both Actions and Dependabot secrets, which
regulad/homelab's `tofu/github` declares.

## Verifying a deploy

CI's "Deploy web" only starts the host's update, and the host pulls
`web-latest` minutes later. A 200 proves nothing: grep the homepage's
`/_next/static/chunks/*.js` for `SENTRY_RELEASE={id:"<sha>"}`. The host is
regulad/homelab's (`ansible-generated/inventory/host_vars/doppelgangerhq.com`).
Read-only investigation over ssh is allowed
(`journalctl -u doppelganger-update.service`); fixes go through homelab.

## Stripe

The account is Parker's own, shared with all of regulad.xyz, and declared in
regulad/homelab's `tofu/stripe`. Never change account-wide settings (default
portal, branding, business details) for Doppelganger. Lookup keys start with
`doppelganger_`. The dashboard's "send test event" sends a fake subscription
ID, which 500s and reports, so it isn't a clean test.

## Outstanding work

Outstanding work is a GitHub issue here, not a list in chat or a TODO file
(Parker, 2026-11-18). Its labels are `sentry`, `blocked: upstream`,
`needs verification` and `deferred`, from `.github/settings.yml`. Close one
with `Fixes #N`, plus `Fixes <SHORT-ID>` for a Sentry issue. Asked what's
outstanding, run `gh issue list`.
