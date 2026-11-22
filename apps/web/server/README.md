The WebSocket proxies required for this proxy necessitate a substantially custom server.

I hate Babel so much.

The `instrument.ts` here is enabled. pm2 loads it before the server, with `--import ./dist/instrument.mjs` in `ecosystem.config.json`'s `node_args` (since c6f3d5c). It makes the process's one Sentry client from `sentry.server.config.ts`, and Next's own instrumentation finds that client and keeps it.
