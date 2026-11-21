import type { Event } from "@sentry/nextjs";

/** How @sentry/nextjs marks the errors Next.js hands to onRequestError */
const NEXT_REQUEST_ERROR = "auto.function.nextjs.on_request_error";

/**
 * Whether an event is Next.js failing to parse a request's body as a form.
 * Next takes a multipart POST to any App Router page, even one that doesn't
 * exist, as a form submitting a server action, and reports a body it can't
 * parse through onRequestError. A body that can't be parsed is the sender's
 * fault: scanners send broken ones to paths like /RSC/<name>.txt
 * (DOPPELGANGER-DP).
 *
 * Only what Next reports: the same error captured by our own code is still
 * sent.
 */
export function isUnparseableRequestBody(event: Event): boolean {
  return (event.exception?.values ?? []).some(
    (exception) =>
      exception.mechanism?.type === NEXT_REQUEST_ERROR &&
      exception.type === "TypeError" &&
      (exception.value ?? "").startsWith("Failed to parse body as FormData"),
  );
}
