/**
 * @jest-environment node
 */

jest.mock("server-only", () => ({}));

const findUnique = jest.fn();
const upsert = jest.fn();

jest.mock("%/database/prisma.ts", () => ({
  getPrisma: () => ({
    stripeCustomer: { findUnique },
    subscription: { upsert },
  }),
}));

import { SubscriptionStatus } from "@/utils/subscriptions.ts";
import Stripe from "stripe";
import { PlanPrice } from "./plans";
import { saveSubscription, syncSubscription } from "./sync";

const planPrices: PlanPrice[] = [
  {
    plan: SubscriptionStatus.PLUS,
    priceId: "price_plus",
    productId: "prod_plus",
  },
  { plan: SubscriptionStatus.PRO, priceId: "price_pro", productId: "prod_pro" },
];

function subscription(productId: string): Stripe.Subscription {
  return {
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    items: {
      data: [
        {
          // a price the plan's lookup key has since moved away from
          price: { id: "price_old", product: productId },
          // the billing period is the item's, since the 2025-03-31 API
          current_period_start: 1_700_000_000,
          current_period_end: 1_702_592_000,
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

beforeEach(() => {
  findUnique.mockReset();
  upsert.mockReset();
});

describe("saveSubscription", () => {
  it("saves a Doppelganger customer's subscription with its product's plan", async () => {
    findUnique.mockResolvedValue({ stripeCustomerId: "cus_1" });

    await expect(
      saveSubscription(subscription("prod_pro"), planPrices),
    ).resolves.toBe("saved");

    const data = {
      status: "active",
      stripePriceId: "price_old",
      plan: SubscriptionStatus.PRO,
      currentPeriodStart: new Date(1_700_000_000_000),
      currentPeriodEnd: new Date(1_702_592_000_000),
    };
    expect(upsert).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: "sub_1" },
      update: data,
      create: {
        ...data,
        stripeSubscriptionId: "sub_1",
        customer: { connect: { stripeCustomerId: "cus_1" } },
      },
    });
  });

  it("saves a subscription to a product that isn't a plan with no plan", async () => {
    findUnique.mockResolvedValue({ stripeCustomerId: "cus_1" });

    await saveSubscription(subscription("prod_other"), planPrices);

    expect(upsert.mock.calls[0][0].update.plan).toBeNull();
  });

  it("leaves another product's customer alone", async () => {
    findUnique.mockResolvedValue(null);

    await expect(
      saveSubscription(subscription("prod_pro"), planPrices),
    ).resolves.toBe("not-ours");
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("syncSubscription", () => {
  it("saves the subscription as Stripe holds it now", async () => {
    findUnique.mockResolvedValue({ stripeCustomerId: "cus_1" });
    const stripe = {
      subscriptions: {
        retrieve: jest.fn().mockResolvedValue(subscription("prod_plus")),
      },
      prices: { list: jest.fn() },
    } as unknown as Stripe;

    await expect(syncSubscription(stripe, "sub_1", planPrices)).resolves.toBe(
      "saved",
    );

    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_1");
    expect(stripe.prices.list).not.toHaveBeenCalled();
    expect(upsert.mock.calls[0][0].update.plan).toBe(SubscriptionStatus.PLUS);
  });
});
