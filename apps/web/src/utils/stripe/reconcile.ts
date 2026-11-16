import { getPrisma } from "%/database/prisma.ts";
import { getPlanPrices } from "@/utils/stripe/plans.ts";
import createStripeClient from "@/utils/stripe/server.ts";
import { saveSubscription, syncSubscription } from "@/utils/stripe/sync.ts";
import "server-only";

// Statuses Stripe never moves a subscription out of
const FINAL_STATUSES = ["canceled", "incomplete_expired"];

export interface ReconcileResult {
  saved: number;
  ended: number;
  missing: number;
}

/**
 * Saves every subscription as Stripe holds it now, for whatever the webhook
 * missed: Stripe stops retrying a delivery after three days, and a missed
 * customer.subscription.deleted would otherwise keep a plan forever.
 */
export async function reconcileSubscriptions(): Promise<ReconcileResult> {
  const prisma = getPrisma();
  const stripe = await createStripeClient();
  const planPrices = await getPlanPrices(stripe);
  const result: ReconcileResult = { saved: 0, ended: 0, missing: 0 };

  // Every subscription on the account that hasn't been canceled, other
  // products' included; saveSubscription skips those
  const listed = new Set<string>();
  for await (const subscription of stripe.subscriptions.list({
    limit: 100,
  })) {
    listed.add(subscription.id);
    if ((await saveSubscription(subscription, planPrices)) === "saved") {
      result.saved++;
    }
  }

  // A subscription saved as still running that Stripe no longer lists has
  // ended since, so fetch it to record how
  const unlisted = await prisma.subscription.findMany({
    where: {
      status: { notIn: FINAL_STATUSES },
      stripeSubscriptionId: { notIn: [...listed] },
    },
  });
  for (const { id, stripeSubscriptionId } of unlisted) {
    try {
      await syncSubscription(stripe, stripeSubscriptionId, planPrices);
      result.ended++;
    } catch (err) {
      if (!isMissing(err)) {
        throw err;
      }
      // The subscription isn't on this account, as with those from the
      // deleted nefum account, so nothing can still be charging for it
      await prisma.subscription.update({
        where: { id },
        data: { status: "canceled" },
      });
      result.missing++;
    }
  }

  return result;
}

function isMissing(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "resource_missing"
  );
}
