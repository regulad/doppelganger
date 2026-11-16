/**
 * @jest-environment node
 */

const getUser = jest.fn();
const findUnique = jest.fn();
const createStripeClient = jest.fn();
const createPortalSession = jest.fn();

jest.mock("@/utils/supabase/server.ts", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
jest.mock("%/database/prisma.ts", () => ({
  getPrisma: () => ({ stripeCustomer: { findUnique } }),
}));
jest.mock("@/utils/stripe/server.ts", () => ({
  __esModule: true,
  default: () => createStripeClient(),
}));
jest.mock("@sentry/nextjs", () => ({ captureException: jest.fn() }));

import { GET } from "./route";

const env = process.env;

beforeEach(() => {
  process.env = { ...env };
  for (const mock of [
    getUser,
    findUnique,
    createStripeClient,
    createPortalSession,
  ]) {
    mock.mockReset();
  }
  getUser.mockResolvedValue({
    data: {
      user: { id: "user1", email: "a@example.com", email_confirmed_at: "x" },
    },
  });
  findUnique.mockResolvedValue({ stripeCustomerId: "cus_1" });
  createStripeClient.mockResolvedValue({
    customers: {
      retrieve: async () => ({ id: "cus_1", email: "a@example.com" }),
    },
    billingPortal: { sessions: { create: createPortalSession } },
  });
  createPortalSession.mockResolvedValue({
    url: "https://billing.stripe.com/p/session/test",
  });
});

afterAll(() => {
  process.env = env;
});

describe("opening the customer portal", () => {
  it("opens Doppelganger's portal configuration", async () => {
    process.env.STRIPE_PORTAL_CONFIGURATION = "bpc_1";

    const res = await GET();

    expect(createPortalSession).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_1", configuration: "bpc_1" }),
    );
    expect(res.headers.get("location")).toBe(
      "https://billing.stripe.com/p/session/test",
    );
  });

  it("sends the user back to their account when there's no configuration", async () => {
    delete process.env.STRIPE_PORTAL_CONFIGURATION;

    const res = await GET();

    expect(createStripeClient).not.toHaveBeenCalled();
    expect(new URL(res.headers.get("location")!).pathname).toBe("/user");
  });
});
