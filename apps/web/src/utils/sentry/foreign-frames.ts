import type { Event } from "@sentry/nextjs";

/**
 * Marks each stack frame from a script another site serves, such as Google's
 * sign-in client (https://accounts.google.com/gsi/client), as not in the app.
 * The browser SDK marks every frame in the app, and Sentry keeps that for any
 * frame outside node_modules, so a third-party script's frames would otherwise
 * read as ours, with no source maps.
 *
 * Only http(s) frames are judged: one from another scheme, such as an app://
 * path or <anonymous>, keeps its mark.
 */
export function markForeignFramesNotInApp<T extends Event>(
  event: T,
  origin: string,
): T {
  for (const exception of event.exception?.values ?? []) {
    for (const frame of exception.stacktrace?.frames ?? []) {
      if (frame.filename && isForeign(frame.filename, origin)) {
        frame.in_app = false;
      }
    }
  }
  return event;
}

function isForeign(filename: string, origin: string): boolean {
  let url: URL;
  try {
    url = new URL(filename);
  } catch {
    return false;
  }
  return (
    (url.protocol === "https:" || url.protocol === "http:") &&
    url.origin !== origin
  );
}
