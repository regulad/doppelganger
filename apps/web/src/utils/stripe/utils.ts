import { getPrisma } from "%/database/prisma.ts";
import fixDateFromPrisma from "@/app/api/cron/util.ts";
import { SubscriptionStatus } from "@/utils/subscriptions";
import "server-only";

export async function getSubscriptionStatus(
  userId: string,
): Promise<SubscriptionStatus> {
  const prisma = getPrisma();

  try {
    // Find the StripeCustomer associated with the Supabase user
    const stripeCustomer = await prisma.stripeCustomer.findUnique({
      where: { supabaseUserId: userId },
      include: { Subscription: true },
    });

    if (!stripeCustomer || stripeCustomer.Subscription.length === 0) {
      return SubscriptionStatus.FREE;
    }

    // Find the most recent active subscription to one of the paid plans
    const activeSubscription = stripeCustomer.Subscription.filter(
      (sub) => ["active", "trialing"].includes(sub.status) && sub.plan,
    ).sort(
      (a, b) =>
        fixDateFromPrisma(b.currentPeriodEnd).getTime() -
        fixDateFromPrisma(a.currentPeriodEnd).getTime(),
    )[0];

    if (!activeSubscription) {
      return SubscriptionStatus.FREE;
    }

    // The plan was worked out from the subscription's product when it was
    // synced from Stripe (utils/stripe/sync.ts), so this needs no Stripe call
    switch (activeSubscription.plan) {
      case SubscriptionStatus.PLUS:
        return SubscriptionStatus.PLUS;
      case SubscriptionStatus.PRO:
        return SubscriptionStatus.PRO;
      default:
        return SubscriptionStatus.FREE;
    }
  } catch (error) {
    console.error("Error fetching subscription status:", error);
    return SubscriptionStatus.FREE; // Default to FREE on error
  }
}
