import { BASE_ORIGIN } from "%/constants.ts";
import { getPrisma } from "%/database/prisma.ts";
import { createStripeCustomer } from "@/app/api/stripe/(checkout-session)/stripe-customer.ts";
import { isResourceMissing } from "@/utils/stripe/errors.ts";
import { getPlanFromParam, getPlanPrices } from "@/utils/stripe/plans.ts";
import createStripeClient from "@/utils/stripe/server.ts";
import { createClient } from "@/utils/supabase/server.ts";
import { getQueryForToast } from "@/utils/toast-utils.ts";
import * as Sentry from "@sentry/nextjs";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const prisma = getPrisma();

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    // The plan comes from the subscribe page's link. It names one of the paid
    // plans rather than a price, since the Stripe account sells other
    // products too.
    const plan = getPlanFromParam(req.nextUrl.searchParams.get("plan"));
    if (!plan) {
      return NextResponse.redirect(
        new URL(
          `/subscribe${getQueryForToast({
            title: "Invalid Request",
            description: "No plan chosen. Please try again.",
          })}`,
          BASE_ORIGIN,
        ),
      );
    }

    if (userError) {
      // A visitor who isn't signed in has no session, which Supabase
      // reports as an error; only other failures are worth reporting
      if (!isAuthSessionMissingError(userError)) {
        Sentry.captureException(userError);
      }
      return NextResponse.redirect(
        new URL(
          `/login${getQueryForToast({
            title: "Sign in",
            description: "Please sign in to start your subscription.",
          })}&next=${encodeURIComponent(`/api/stripe/get-checkout-session?plan=${plan.toLowerCase()}`)}`,
          BASE_ORIGIN,
        ),
      );
    }

    if (!user) {
      return NextResponse.redirect(
        new URL(
          `/login${getQueryForToast({
            title: "Sign in",
            description: "Please sign in to start your subscription.",
          })}&next=${encodeURIComponent(`/api/stripe/get-checkout-session?plan=${plan.toLowerCase()}`)}`,
          BASE_ORIGIN,
        ),
      );
    }

    if (!user.email_confirmed_at) {
      return NextResponse.redirect(
        new URL(
          `/user${getQueryForToast({
            title: "Email Confirmation Required",
            description: "Please confirm your email before subscribing.",
          })}`,
          BASE_ORIGIN,
        ),
      );
    }

    const stripe = await createStripeClient();

    let stripeCustomer = await prisma.stripeCustomer.findUnique({
      where: { supabaseUserId: user.id },
    });

    if (stripeCustomer) {
      try {
        const stripeCustomerData = await stripe.customers.retrieve(
          stripeCustomer.stripeCustomerId,
        );

        if (stripeCustomerData.deleted) {
          throw new Error("Stripe customer was deleted");
        }

        if (stripeCustomerData.email !== user.email) {
          await stripe.customers.update(stripeCustomer.stripeCustomerId, {
            email: user.email,
          });
        }
      } catch (error) {
        // A customer from the deleted nefum account is expected to be gone
        if (!isResourceMissing(error)) {
          Sentry.captureException(error);
        }
        console.log(
          "Error retrieving Stripe customer, creating a new one:",
          error,
        );
        stripeCustomer = await createStripeCustomer(user.email!, user.id);
      }
    } else {
      stripeCustomer = await createStripeCustomer(user.email!, user.id);
    }

    const { priceId } = (await getPlanPrices(stripe)).find(
      (p) => p.plan === plan,
    )!;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer: stripeCustomer.stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      // checkout-complete saves the subscription, then shows the devices.
      // Stripe fills in {CHECKOUT_SESSION_ID}.
      success_url: `${BASE_ORIGIN}/api/stripe/checkout-complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: new URL(
        `/subscribe${getQueryForToast({
          title: "Canceled",
          description:
            "Your signup was cancelled. Would you like to tell us why? ",
        })}`,
        BASE_ORIGIN,
      ).toString(),
    });

    return NextResponse.redirect(session.url!);
  } catch (error) {
    console.error("Error creating checkout session:", error);
    Sentry.captureException(error);
    return NextResponse.redirect(
      new URL(
        `/subscribe${getQueryForToast({
          title: "Error",
          description: "An unexpected error occurred. Please try again later.",
        })}`,
        BASE_ORIGIN,
      ),
    );
  }
}
