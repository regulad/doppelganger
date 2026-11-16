/**
 * @jest-environment node
 */

jest.mock("server-only", () => ({}));

import { SubscriptionStatus } from "@/utils/subscriptions.ts";
import Stripe from "stripe";
import { getPlanForProduct, getPlanFromParam, getPlanPrices } from "./plans";

function stripeListing(prices: object[]) {
  return {
    prices: { list: jest.fn().mockResolvedValue({ data: prices }) },
  } as unknown as Stripe & { prices: { list: jest.Mock } };
}

const planPrices = [
  {
    plan: SubscriptionStatus.PLUS,
    priceId: "price_plus",
    productId: "prod_plus",
  },
  { plan: SubscriptionStatus.PRO, priceId: "price_pro", productId: "prod_pro" },
] as const;

describe("getPlanPrices", () => {
  it("finds each plan's price and product by lookup key", async () => {
    const stripe = stripeListing([
      {
        id: "price_pro",
        lookup_key: "doppelganger_pro_monthly",
        product: "prod_pro",
      },
      {
        id: "price_plus",
        lookup_key: "doppelganger_plus_monthly",
        product: { id: "prod_plus" },
      },
    ]);

    await expect(getPlanPrices(stripe)).resolves.toEqual(planPrices);
    expect(stripe.prices.list).toHaveBeenCalledWith({
      lookup_keys: ["doppelganger_plus_monthly", "doppelganger_pro_monthly"],
      active: true,
    });
  });

  it("fails when a plan has no price", async () => {
    const stripe = stripeListing([
      {
        id: "price_plus",
        lookup_key: "doppelganger_plus_monthly",
        product: "prod_plus",
      },
    ]);

    await expect(getPlanPrices(stripe)).rejects.toThrow(
      "doppelganger_pro_monthly",
    );
  });
});

describe("getPlanFromParam", () => {
  it("knows the subscribe page's plan names", () => {
    expect(getPlanFromParam("plus")).toBe(SubscriptionStatus.PLUS);
    expect(getPlanFromParam("pro")).toBe(SubscriptionStatus.PRO);
  });

  it("knows no other names", () => {
    for (const param of [null, "", "free", "PRO", "constructor", "__proto__"]) {
      expect(getPlanFromParam(param)).toBeNull();
    }
  });
});

describe("getPlanForProduct", () => {
  it("names the plan a product is sold as", () => {
    expect(getPlanForProduct([...planPrices], "prod_pro")).toBe(
      SubscriptionStatus.PRO,
    );
  });

  it("has no plan for another product", () => {
    expect(getPlanForProduct([...planPrices], "prod_other")).toBeNull();
  });
});
