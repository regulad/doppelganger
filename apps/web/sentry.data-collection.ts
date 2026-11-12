import type * as Sentry from "@sentry/nextjs";

// Header and query parameter names that carry client addresses
const addressTerms = ["forwarded", "-ip", "remote-", "via", "-user"];

// What Sentry collected by default up to v10 (sendDefaultPii unset): no user
// info, cookies or HTTP bodies, and no headers or query parameters carrying
// client addresses. From v11, an unset dataCollection collects all of those.
// This is the baseline from Sentry's v10-to-v11 migration guide.
export const dataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: { deny: addressTerms },
    response: { deny: addressTerms },
  },
  httpBodies: [],
  urlQueryParams: { deny: addressTerms },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  graphQL: { document: false, variables: false },
} satisfies NonNullable<Parameters<typeof Sentry.init>[0]>["dataCollection"];
