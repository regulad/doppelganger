/**
 * Whether Stripe answered that an object doesn't exist. Customers and
 * subscriptions saved before Doppelganger moved to regulad.xyz's account
 * belong to the deleted nefum account, so Stripe answers this for them.
 */
export function isResourceMissing(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "resource_missing"
  );
}
