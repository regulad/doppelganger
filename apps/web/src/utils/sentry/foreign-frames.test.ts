import type { Event, StackFrame } from "@sentry/nextjs";
import { markForeignFramesNotInApp } from "./foreign-frames.ts";

const origin = "https://doppelgangerhq.com";

function eventWith(...filenames: string[]): Event {
  return {
    exception: {
      values: [
        {
          type: "Error",
          value: "pa",
          stacktrace: {
            frames: filenames.map((filename) => ({ filename, in_app: true })),
          },
        },
      ],
    },
  };
}

function inAppOf(event: Event): (boolean | undefined)[] {
  return (event.exception!.values![0].stacktrace!.frames as StackFrame[]).map(
    (frame) => frame.in_app,
  );
}

describe("markForeignFramesNotInApp", () => {
  it("takes Google's sign-in client out of the app and keeps our chunks in", () => {
    const event = eventWith(
      "https://doppelgangerhq.com/_next/static/chunks/app/layout-0123abcd.js",
      "https://accounts.google.com/gsi/client",
    );
    expect(inAppOf(markForeignFramesNotInApp(event, origin))).toEqual([
      true,
      false,
    ]);
  });

  it("treats another port or scheme of our host as another origin", () => {
    const event = eventWith(
      "http://doppelgangerhq.com/_next/static/chunks/main.js",
      "https://doppelgangerhq.com:8443/_next/static/chunks/main.js",
    );
    expect(inAppOf(markForeignFramesNotInApp(event, origin))).toEqual([
      false,
      false,
    ]);
  });

  it("leaves frames that aren't http(s) URLs alone", () => {
    const event = eventWith(
      "app:///_next/static/chunks/app/page-0123abcd.js",
      "<anonymous>",
      "[native code]",
      "blob:https://doppelgangerhq.com/0f6d1a2b",
    );
    expect(inAppOf(markForeignFramesNotInApp(event, origin))).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it("passes an event without a stack trace through", () => {
    const event: Event = { message: "no frames" };
    expect(markForeignFramesNotInApp(event, origin)).toBe(event);
  });
});
