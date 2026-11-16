// Sets up Sentry before anything else in the server process, so that it can
// instrument the modules the custom server imports. ecosystem.config.json loads
// it ahead of the server with `node --import ./dist/instrument.mjs`.
//
// Next.js runs inside this process, and a process has one Sentry client. The
// Next.js SDK's init keeps any client that already exists and then skips its
// own Next.js setup, so the client made here has to be the Next.js SDK's:
// this loads the same config that Next.js does.
import "../../sentry.server.config.ts";
