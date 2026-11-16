import { BASE_ORIGIN } from "%/constants.ts";
import { getPrisma } from "%/database/prisma.ts";
import createStripeClient from "@/utils/stripe/server.ts";
import { syncSubscription } from "@/utils/stripe/sync.ts";
import { createClient } from "@/utils/supabase/server.ts";
import { getQueryForToast } from "@/utils/toast-utils.ts";
import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Where Stripe Checkout sends a customer after they subscribe. It saves the
 * new subscription before showing their devices, so the new plan is there
 * even if the webhook hasn't arrived yet.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const sessionId = req.nextUrl.searchParams.get("session_id");

  if (sessionId) {
    try {
      await syncCheckoutSession(sessionId);
    } catch (error) {
      // the webhook, or the cron's reconciliation, saves it anyway
      console.error("Couldn't sync a completed checkout:", error);
      Sentry.captureException(error);
    }
  }

  return NextResponse.redirect(
    new URL(
      `/devices${getQueryForToast({
        title: "Success",
        description:
          "Your subscription was successful! Welcome to Doppelganger Premium!",
      })}`,
      BASE_ORIGIN,
    ),
  );
}

async function syncCheckoutSession(sessionId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return;
  }

  const stripeCustomer = await getPrisma().stripeCustomer.findUnique({
    where: { supabaseUserId: user.id },
  });
  if (!stripeCustomer) {
    return;
  }

  const stripe = await createStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  // only the signed-in user's own checkout
  const sessionCustomer =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;
  if (sessionCustomer !== stripeCustomer.stripeCustomerId) {
    return;
  }

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;
  if (subscriptionId) {
    await syncSubscription(stripe, subscriptionId);
  }
}
