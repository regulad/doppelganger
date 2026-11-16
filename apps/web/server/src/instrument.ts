// Sets up Sentry before anything else in the server process, so that it can
// instrument the modules the custom server imports. ecosystem.config.json loads
// it ahead of the server with `node --import ./dist/instrument.mjs`.
//
// Next.js runs inside this process, and a process has one Sentry client. The
// Next.js SDK's init keeps any client that already exists and then skips its
// own Next.js setup, so the client made here has to be the Next.js SDK's:
// this loads the same config that Next.js does.
import { loadEnvironment } from "./load-environment";

// The DSN (NEXT_PUBLIC_SENTRY_DSN) comes from .env.local, which the server
// itself loads only after this has run. Static imports are evaluated before
// any of this module's code, so the config is imported once the environment
// is loaded.
loadEnvironment();
await import("../../sentry.server.config.ts");
