// Where the web app reports to Sentry: the browser, the Next.js server and edge
// runtimes, and the custom server. Unset or empty, Sentry stays off.
//
// Next.js writes NEXT_PUBLIC_ values into its bundles at build time, so the
// browser and Next's own code keep the value from the build (.env.local.public,
// copied to .env.local before `next build`). The custom server's Sentry client
// (server/src/instrument.ts), which is the one the server process uses, reads
// it when the process starts.
export const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;
