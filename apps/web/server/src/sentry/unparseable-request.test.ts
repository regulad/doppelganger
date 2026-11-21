/**
 * @jest-environment node
 */

import type { Event, Exception } from "@sentry/nextjs";
import { isUnparseableRequestBody } from "./unparseable-request.ts";

// DOPPELGANGER-DP: a POST to /RSC/7n03gyhqj8hicbb.txt with a multipart body
// and no boundary, as Sentry received it
const unparseableBody: Exception[] = [
  {
    type: "TypeError",
    value: "no boundary found in multipart body",
    mechanism: { type: "chained", handled: true },
  },
  {
    type: "TypeError",
    value: "Failed to parse body as FormData.",
    mechanism: {
      type: "auto.function.nextjs.on_request_error",
      handled: false,
    },
  },
];

const eventWith = (values: Exception[]): Event => ({
  exception: { values },
});

describe("isUnparseableRequestBody", () => {
  it("recognizes Next failing to parse a scanner's broken body", () => {
    expect(isUnparseableRequestBody(eventWith(unparseableBody))).toBe(true);
  });

  it("leaves the same error alone when our own code captured it", () => {
    const captured = unparseableBody.map((exception) => ({
      ...exception,
      mechanism: { type: "generic", handled: true },
    }));
    expect(isUnparseableRequestBody(eventWith(captured))).toBe(false);
  });

  it("leaves Next's other request errors alone", () => {
    expect(
      isUnparseableRequestBody(
        eventWith([
          {
            type: "Error",
            value: "Couldn't reach the database",
            mechanism: {
              type: "auto.function.nextjs.on_request_error",
              handled: false,
            },
          },
        ]),
      ),
    ).toBe(false);
  });

  it("leaves an event without an exception alone", () => {
    expect(isUnparseableRequestBody({ message: "a message" })).toBe(false);
  });
});
