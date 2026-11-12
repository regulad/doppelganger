import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { dataCollection } from "../../sentry.data-collection";

// Ensure to call this before importing any other modules!
Sentry.init({
  dsn: "https://710be47ec5a69191ec82397c11089305@o4506961510596608.ingest.us.sentry.io/4507657370337280",
  enabled: process.env.NODE_ENV === "production",

  integrations: [
    // Add our Profiling integration
    nodeProfilingIntegration(),
    Sentry.anrIntegration({ captureStackTrace: true }),
  ],

  // Add Tracing by setting tracesSampleRate
  // We recommend adjusting this value in production
  tracesSampleRate: 1.0,

  // Profile every session, while a trace is active (session-based profiling
  // replaced v8's per-transaction profilesSampleRate in v11)
  profileSessionSampleRate: 1.0,
  profileLifecycle: "trace",

  dataCollection,
});
