/**
 * @jest-environment node
 */

const getUser = jest.fn();
const findUnique = jest.fn();
const retrieve = jest.fn();
const syncSubscription = jest.fn();
const captureException = jest.fn();

jest.mock("@/utils/supabase/server.ts", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
jest.mock("%/database/prisma.ts", () => ({
  getPrisma: () => ({ stripeCustomer: { findUnique } }),
}));
jest.mock("@/utils/stripe/server.ts", () => ({
  __esModule: true,
  default: async () => ({ checkout: { sessions: { retrieve } } }),
}));
jest.mock("@/utils/stripe/sync.ts", () => ({
  syncSubscription: (...args: unknown[]) => syncSubscription(...args),
}));
jest.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

import { NextRequest } from "next/server";
import { GET } from "./route";

function request(sessionId: string | null): NextRequest {
  const url = new URL(
    "https://doppelgangerhq.com/api/stripe/checkout-complete",
  );
  if (sessionId) {
    url.searchParams.set("session_id", sessionId);
  }
  return { nextUrl: url } as unknown as NextRequest;
}

beforeEach(() => {
  for (const mock of [
    getUser,
    findUnique,
    retrieve,
    syncSubscription,
    captureException,
  ]) {
    mock.mockReset();
  }
  getUser.mockResolvedValue({ data: { user: { id: "user1" } } });
  findUnique.mockResolvedValue({ stripeCustomerId: "cus_1" });
});

async function expectDevicesPage(sessionId: string | null) {
  const res = await GET(request(sessionId));
  expect(res.status).toBe(307);
  expect(new URL(res.headers.get("location")!).pathname).toBe("/devices");
}

describe("returning from checkout", () => {
  it("saves the user's new subscription before showing their devices", async () => {
    retrieve.mockResolvedValue({ customer: "cus_1", subscription: "sub_1" });

    await expectDevicesPage("cs_1");

    expect(retrieve).toHaveBeenCalledWith("cs_1");
    expect(syncSubscription).toHaveBeenCalledWith(expect.anything(), "sub_1");
  });

  it("leaves another customer's checkout alone", async () => {
    retrieve.mockResolvedValue({ customer: "cus_2", subscription: "sub_2" });

    await expectDevicesPage("cs_2");

    expect(syncSubscription).not.toHaveBeenCalled();
  });

  it("still shows the devices when the sync fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    retrieve.mockRejectedValue(new Error("Stripe is down"));

    await expectDevicesPage("cs_1");

    expect(captureException).toHaveBeenCalled();
  });

  it("shows the devices when there's no session to sync", async () => {
    await expectDevicesPage(null);

    expect(retrieve).not.toHaveBeenCalled();
  });
});
