import { getPrisma } from "%/database/prisma.ts";
import {
  getPlanForProduct,
  getPlanPrices,
  PlanPrice,
} from "@/utils/stripe/plans.ts";
import "server-only";
import Stripe from "stripe";

export type SyncResult = "saved" | "not-ours";

/**
 * Saves a subscription as Stripe describes it. The Stripe account is shared
 * with the rest of regulad.xyz, so a subscription whose customer Doppelganger
 * didn't create is someone else's and is left alone.
 */
export async function saveSubscription(
  subscription: Stripe.Subscription,
  planPrices: PlanPrice[],
): Promise<SyncResult> {
  const prisma = getPrisma();

  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const stripeCustomer = await prisma.stripeCustomer.findUnique({
    where: { stripeCustomerId },
  });
  if (!stripeCustomer) {
    return "not-ours";
  }

  // Doppelganger's subscriptions have one item, its plan. Since the 2025-03-31
  // API, the billing period is the item's rather than the subscription's.
  const item = subscription.items.data[0];
  const price = item.price;
  const productId =
    typeof price.product === "string" ? price.product : price.product.id;

  const data = {
    status: subscription.status,
    stripePriceId: price.id,
    plan: getPlanForProduct(planPrices, productId),
    currentPeriodStart: new Date(item.current_period_start * 1000),
    currentPeriodEnd: new Date(item.current_period_end * 1000),
  };

  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: subscription.id },
    update: data,
    create: {
      ...data,
      stripeSubscriptionId: subscription.id,
      customer: { connect: { stripeCustomerId } },
    },
  });

  return "saved";
}

/** Fetches a subscription from Stripe and saves what Stripe holds now. */
export async function syncSubscription(
  stripe: Stripe,
  subscriptionId: string,
  planPrices?: PlanPrice[],
): Promise<SyncResult> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  return saveSubscription(
    subscription,
    planPrices ?? (await getPlanPrices(stripe)),
  );
}
