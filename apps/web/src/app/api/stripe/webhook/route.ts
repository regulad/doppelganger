import createStripeClient from "@/utils/stripe/server";
import { syncSubscription } from "@/utils/stripe/sync.ts";
import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

interface WebhookResponse {
  received?: boolean;
  error?: string;
}

const SUBSCRIPTION_EVENTS = new Set<Stripe.Event.Type>([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

export async function POST(
  req: NextRequest,
): Promise<NextResponse<WebhookResponse>> {
  const stripe = await createStripeClient();
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig ?? "",
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.error("Webhook signature didn't verify:", err);
    // A request with no signature at all isn't from Stripe. A signature that
    // doesn't verify can mean the endpoint's secret is out of date.
    if (sig) {
      Sentry.captureException(err);
    }
    return NextResponse.json({ error: "Webhook Error" }, { status: 400 });
  }

  if (SUBSCRIPTION_EVENTS.has(event.type)) {
    const { id } = event.data.object as Stripe.Subscription;
    try {
      // Stripe doesn't deliver events in order, and the payload is the
      // subscription as it was when the event happened, so this saves what
      // Stripe holds now instead
      const result = await syncSubscription(stripe, id);
      if (result === "not-ours") {
        // the account is shared with the rest of regulad.xyz
        console.log(`Subscription ${id} isn't Doppelganger's; ignored`);
      }
    } catch (err) {
      console.error(`Couldn't sync subscription ${id}:`, err);
      Sentry.captureException(err, {
        tags: { "stripe.event": event.type, "stripe.subscription": id },
      });
      // Stripe retries a failed delivery for up to three days
      return NextResponse.json(
        { error: "Couldn't save the subscription" },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ received: true });
}
