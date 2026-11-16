import { PLUS_STRIPE_LOOKUP_KEY, PRO_STRIPE_LOOKUP_KEY } from "%/constants.ts";
import { SubscriptionStatus } from "@/utils/subscriptions.ts";
import "server-only";
import Stripe from "stripe";

export type PaidPlan = SubscriptionStatus.PLUS | SubscriptionStatus.PRO;

const PLAN_LOOKUP_KEYS: Record<PaidPlan, string> = {
  [SubscriptionStatus.PLUS]: PLUS_STRIPE_LOOKUP_KEY,
  [SubscriptionStatus.PRO]: PRO_STRIPE_LOOKUP_KEY,
};

// The names the subscribe page uses for the paid plans in its links. A Map,
// so a name like "constructor" can't find an inherited property.
const PLAN_PARAMS = new Map<string, PaidPlan>([
  ["plus", SubscriptionStatus.PLUS],
  ["pro", SubscriptionStatus.PRO],
]);

export function getPlanFromParam(param: string | null): PaidPlan | null {
  return (param && PLAN_PARAMS.get(param)) || null;
}

export interface PlanPrice {
  plan: PaidPlan;
  priceId: string;
  productId: string;
}

/**
 * The price each paid plan is sold at now, found by its lookup key. A plan is
 * its product: a subscription keeps its plan when tofu replaces the price,
 * since the replacement takes over the lookup key on the same product.
 */
export async function getPlanPrices(stripe: Stripe): Promise<PlanPrice[]> {
  const { data } = await stripe.prices.list({
    lookup_keys: Object.values(PLAN_LOOKUP_KEYS),
    active: true,
  });

  return (Object.entries(PLAN_LOOKUP_KEYS) as [PaidPlan, string][]).map(
    ([plan, lookupKey]) => {
      const price = data.find((p) => p.lookup_key === lookupKey);
      if (!price) {
        throw new Error(
          `Stripe has no active price with the lookup key ${lookupKey}`,
        );
      }
      return {
        plan,
        priceId: price.id,
        productId:
          typeof price.product === "string" ? price.product : price.product.id,
      };
    },
  );
}

export function getPlanForProduct(
  planPrices: PlanPrice[],
  productId: string,
): PaidPlan | null {
  return planPrices.find((p) => p.productId === productId)?.plan ?? null;
}
