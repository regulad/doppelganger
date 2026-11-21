// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import { markForeignFramesNotInApp } from "@/utils/sentry/foreign-frames.ts";
import * as Sentry from "@sentry/nextjs";
import { dataCollection } from "../sentry.data-collection.ts";
import { dsn } from "../sentry.dsn.ts";

Sentry.init({
  dsn,
  enabled: process.env.NODE_ENV === "production",

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 1,
  // Set `tracePropagationTargets` to control for which URLs trace propagation should be enabled
  tracePropagationTargets: ["localhost", /^https:\/\/doppelgangerhq\.com\/api/],

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  replaysOnErrorSampleRate: 1.0,

  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // You can remove this option if you're not planning to use the Sentry Session Replay feature:
  integrations: [
    Sentry.replayIntegration({
      // Additional Replay configuration goes in here, for example:
      maskAllText: true,
      blockAllMedia: true,
    }),
    Sentry.browserProfilingIntegration(),
    // pw: this renders RIGHT where our toast notifications are, so we're disabling it for now
    // Sentry.feedbackIntegration({
    //   // Additional SDK configuration goes in here, for example:
    //   colorScheme: "system",
    //   enableScreenshot: false,
    // }),
  ],

  // Profile every session, while a trace is active (session-based profiling
  // replaced v8's per-transaction profilesSampleRate in v11)
  profileSessionSampleRate: 1.0,
  profileLifecycle: "trace",

  dataCollection,

  // Frames from other sites' scripts, such as Google's sign-in client, keep
  // their origin (see thirdPartyOriginStackFrames in next.config.mjs) and
  // aren't ours
  beforeSend: (event) =>
    markForeignFramesNotInApp(event, window.location.origin),
});

// Traces client-side navigations
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
