/**
 * @jest-environment node
 */

const constructEvent = jest.fn();
const syncSubscription = jest.fn();
const captureException = jest.fn();

jest.mock("@/utils/stripe/server", () => ({
  __esModule: true,
  default: async () => ({ webhooks: { constructEvent } }),
}));
jest.mock("@/utils/stripe/sync.ts", () => ({
  syncSubscription: (...args: unknown[]) => syncSubscription(...args),
}));
jest.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

import { NextRequest } from "next/server";
import { POST } from "./route";

function request(signature: string | null): NextRequest {
  return {
    text: async () => "{}",
    headers: new Headers(signature ? { "stripe-signature": signature } : {}),
  } as unknown as NextRequest;
}

function subscriptionEvent(type: string) {
  return { type, data: { object: { id: "sub_1" } } };
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
  constructEvent.mockReset();
  syncSubscription.mockReset();
  captureException.mockReset();
});

afterEach(() => jest.restoreAllMocks());

describe("the Stripe webhook", () => {
  it("syncs the subscription a subscription event names", async () => {
    constructEvent.mockReturnValue(
      subscriptionEvent("customer.subscription.deleted"),
    );
    syncSubscription.mockResolvedValue("saved");

    const res = await POST(request("t=1,v1=good"));

    expect(res.status).toBe(200);
    expect(syncSubscription).toHaveBeenCalledWith(expect.anything(), "sub_1");
  });

  it("accepts another product's subscription without reporting it", async () => {
    constructEvent.mockReturnValue(
      subscriptionEvent("customer.subscription.created"),
    );
    syncSubscription.mockResolvedValue("not-ours");

    const res = await POST(request("t=1,v1=good"));

    expect(res.status).toBe(200);
    expect(captureException).not.toHaveBeenCalled();
  });

  it("fails, so that Stripe retries, when the subscription can't be saved", async () => {
    constructEvent.mockReturnValue(
      subscriptionEvent("customer.subscription.updated"),
    );
    syncSubscription.mockRejectedValue(new Error("database down"));

    const res = await POST(request("t=1,v1=good"));

    expect(res.status).toBe(500);
    expect(captureException).toHaveBeenCalled();
  });

  it("ignores other events", async () => {
    constructEvent.mockReturnValue({ type: "invoice.paid", data: {} });

    const res = await POST(request("t=1,v1=good"));

    expect(res.status).toBe(200);
    expect(syncSubscription).not.toHaveBeenCalled();
  });

  it("rejects and reports a signature that doesn't verify", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature");
    });

    const res = await POST(request("t=1,v1=bad"));

    expect(res.status).toBe(400);
    expect(captureException).toHaveBeenCalled();
  });

  it("rejects an unsigned request without reporting it", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("No stripe-signature header value was provided.");
    });

    const res = await POST(request(null));

    expect(res.status).toBe(400);
    expect(captureException).not.toHaveBeenCalled();
  });
});
