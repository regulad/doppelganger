import "server-only";
import Stripe from "stripe";

export default async function createClient(): Promise<Stripe> {
  if (!process.env.STRIPE_SECRET) {
    throw new Error("STRIPE_SECRET is not set");
  }

  return new Stripe(process.env.STRIPE_SECRET!, {
    // stripe-node pins one API version; the webhook endpoint in Stripe sends
    // its events in the version it's set to
    apiVersion: "2026-10-28.endive",
    appInfo: {
      name: "Doppelganger",
      // version: '1.0.0', // no way to provide verison
    },
  });
}
