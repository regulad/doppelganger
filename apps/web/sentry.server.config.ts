// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
//
// It sets up the one Sentry client of the server process, which Next.js runs
// inside: the custom server loads it first, through server/src/instrument.ts,
// and Next's own import of it (src/instrumentation.ts) then finds that client
// and keeps it.

import * as Sentry from "@sentry/nextjs";
// deprecated in favor of @sentry/node-native's eventLoopBlockIntegration, a
// native addon; @sentry/nextjs no longer re-exports it
import { anrIntegration } from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { dataCollection } from "./sentry.data-collection.ts";
import { dsn } from "./sentry.dsn.ts";
import { readSentryContext } from "./server/src/sentry/error-context.ts";
import { describeProcessState } from "./server/src/sentry/process-state.ts";

if (!dsn && process.env.NODE_ENV === "production") {
  console.warn("NEXT_PUBLIC_SENTRY_DSN is not set, so Sentry is off");
}

Sentry.init({
  dsn,
  enabled: process.env.NODE_ENV === "production",

  initialScope: {
    tags: {
      // Which of pm2's cluster workers sent the event. Two events from
      // different workers at once can mean they raced each other.
      "pm2.instance": process.env.NODE_APP_INSTANCE ?? "none",
    },
  },

  // Copies the tags and contexts an error carries (withSentryContext in
  // server/src/sentry/error-context.ts) onto its event, wherever the error
  // was captured
  beforeSend(event, hint) {
    const { tags, contexts } = readSentryContext(hint.originalException);
    if (tags && Object.keys(tags).length) {
      event.tags = { ...event.tags, ...tags };
    }
    if (contexts && Object.keys(contexts).length) {
      event.contexts = { ...event.contexts, ...contexts };
    }
    // An uncaught exception, which Sentry reports as fatal, often has no
    // stack to say where it came from, so record what the process held
    if (event.level === "fatal") {
      event.contexts = {
        ...event.contexts,
        process_state: describeProcessState(hint.originalException),
      };
    }
    return event;
  },

  integrations: [
    // Add our Profiling integration
    nodeProfilingIntegration(),
    anrIntegration({ captureStackTrace: true }),
  ],

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 1,

  // Profile every session, while a trace is active (session-based profiling
  // replaced v8's per-transaction profilesSampleRate in v11)
  profileSessionSampleRate: 1.0,
  profileLifecycle: "trace",

  dataCollection,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: process.env.NODE_ENV === 'development',
});
