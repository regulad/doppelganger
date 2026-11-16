/**
 * @jest-environment node
 */

jest.mock("server-only", () => ({}));

const findUnique = jest.fn();

jest.mock("%/database/prisma.ts", () => ({
  getPrisma: () => ({ stripeCustomer: { findUnique } }),
}));

import { SubscriptionStatus } from "@/utils/subscriptions.ts";
import { getSubscriptionStatus } from "./utils";

function subscription(status: string, plan: string | null, endDay: number) {
  return {
    status,
    plan,
    currentPeriodEnd: new Date(Date.UTC(2026, 10, endDay)),
  };
}

function customerWith(...subscriptions: object[]) {
  findUnique.mockResolvedValue({ Subscription: subscriptions });
}

beforeEach(() => findUnique.mockReset());

describe("getSubscriptionStatus", () => {
  it("is the plan of the active subscription", async () => {
    customerWith(subscription("active", "PRO", 20));
    await expect(getSubscriptionStatus("user1")).resolves.toBe(
      SubscriptionStatus.PRO,
    );
  });

  it("is free for a customer with no subscriptions", async () => {
    findUnique.mockResolvedValue(null);
    await expect(getSubscriptionStatus("user1")).resolves.toBe(
      SubscriptionStatus.FREE,
    );
  });

  it("ignores subscriptions that have ended", async () => {
    customerWith(subscription("canceled", "PRO", 20));
    await expect(getSubscriptionStatus("user1")).resolves.toBe(
      SubscriptionStatus.FREE,
    );
  });

  it("ignores an active subscription to something that isn't a plan", async () => {
    customerWith(
      subscription("active", null, 30),
      subscription("trialing", "PLUS", 20),
    );
    await expect(getSubscriptionStatus("user1")).resolves.toBe(
      SubscriptionStatus.PLUS,
    );
  });
});
