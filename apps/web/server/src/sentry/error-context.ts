// Lets an error carry the Sentry tags and contexts that explain it, so they
// reach Sentry wherever the error is finally captured, however many callers it
// passes through first. sentry.server.config.ts's beforeSend reads them off the
// captured error and the errors in its cause chain.
//
// The key is a registered symbol, not a module-level one: the custom server
// and Next.js bundle this file separately, and both must find the same key.

export interface SentryErrorContext {
  tags?: Record<string, string>;
  contexts?: Record<string, Record<string, unknown>>;
}

const SENTRY_CONTEXT = Symbol.for("doppelganger.sentryContext");

type WithSentryContext = { [SENTRY_CONTEXT]?: SentryErrorContext };

/**
 * Adds Sentry tags and contexts to an error, merging them with any it already
 * carries, and returns the error. A thrown value that isn't an object is
 * wrapped in an Error first.
 */
export function withSentryContext(
  error: unknown,
  context: SentryErrorContext,
): Error {
  const target =
    error instanceof Error
      ? error
      : Object.assign(new Error(String(error)), { cause: error });
  const carrier = target as Error & WithSentryContext;
  const existing = carrier[SENTRY_CONTEXT] ?? {};
  carrier[SENTRY_CONTEXT] = {
    tags: { ...existing.tags, ...context.tags },
    contexts: { ...existing.contexts, ...context.contexts },
  };
  return target;
}

/**
 * The Sentry context carried by an error and its causes, the outermost error's
 * winning where they overlap.
 */
export function readSentryContext(error: unknown): SentryErrorContext {
  const chain: SentryErrorContext[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (
    current !== null &&
    typeof current === "object" &&
    !seen.has(current)
  ) {
    seen.add(current);
    const context = (current as WithSentryContext)[SENTRY_CONTEXT];
    if (context) chain.push(context);
    current = (current as { cause?: unknown }).cause;
  }

  const merged: SentryErrorContext = { tags: {}, contexts: {} };
  for (const context of chain.reverse()) {
    Object.assign(merged.tags!, context.tags);
    Object.assign(merged.contexts!, context.contexts);
  }
  return merged;
}
