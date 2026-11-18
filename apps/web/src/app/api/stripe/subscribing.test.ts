/**
 * @jest-environment node
 */

// Someone subscribing to Plus and then managing their subscription, through
// the real routes, the real Stripe client and real webhook signatures.
//
// Every request to Stripe goes to stripe-mock
// (https://github.com/stripe/stripe-mock), which checks it against Stripe's
// API spec and answers with Stripe's example objects. Those carry made-up IDs,
// so each answer then gets this story's IDs (its customer, prices, checkout
// session and subscription), keeping the rest of Stripe's example.
//
// CI runs stripe-mock beside the tests and sets STRIPE_MOCK_URL. Elsewhere the
// tests are skipped without it; run `stripe-mock` and set it to run them.

import type StripeType from "stripe";

const STRIPE_MOCK_URL = process.env.STRIPE_MOCK_URL;

const USER = {
  id: "user_doppelganger",
  email: "subscriber@example.com",
  email_confirmed_at: "2026-11-18T00:00:00Z",
};
const CUSTOMER = "cus_doppelganger";
const PRICES = {
  plus: {
    id: "price_plus",
    product: "prod_plus",
    lookup_key: "doppelganger_plus_monthly",
  },
  pro: {
    id: "price_pro",
    product: "prod_pro",
    lookup_key: "doppelganger_pro_monthly",
  },
};
const CHECKOUT_SESSION = "cs_doppelganger";
const CHECKOUT_URL = "https://checkout.stripe.com/c/pay/cs_doppelganger";
const SUBSCRIPTION = "sub_doppelganger";
const PORTAL_URL = "https://billing.stripe.com/p/session/doppelganger";
const WEBHOOK_SECRET = "whsec_doppelganger";

/** What Stripe holds for the subscription, which the story changes */
const story: { subscriptionStatus: StripeType.Subscription.Status } = {
  subscriptionStatus: "active",
};

/** Stripe's example answer, given this story's IDs */
function tellTheStory(method: string, path: string, body: any): unknown {
  switch (`${method} ${path}`) {
    case "GET /v1/prices":
      return {
        ...body,
        data: Object.values(PRICES).map((price) => ({
          ...body.data[0],
          ...price,
        })),
      };
    case "POST /v1/customers":
      return { ...body, id: CUSTOMER };
    case `GET /v1/customers/${CUSTOMER}`:
      return { ...body, id: CUSTOMER, email: USER.email };
    case "POST /v1/checkout/sessions":
      return { ...body, id: CHECKOUT_SESSION, url: CHECKOUT_URL };
    case `GET /v1/checkout/sessions/${CHECKOUT_SESSION}`:
      return {
        ...body,
        id: CHECKOUT_SESSION,
        customer: CUSTOMER,
        subscription: SUBSCRIPTION,
      };
    case `GET /v1/subscriptions/${SUBSCRIPTION}`: {
      const [item] = body.items.data;
      return {
        ...body,
        id: SUBSCRIPTION,
        customer: CUSTOMER,
        status: story.subscriptionStatus,
        items: {
          ...body.items,
          data: [{ ...item, price: { ...item.price, ...PRICES.plus } }],
        },
      };
    }
    case "POST /v1/billing_portal/sessions":
      return { ...body, url: PORTAL_URL };
    default:
      return body;
  }
}

/** The requests the routes made of Stripe, with their parameters */
const stripeRequests: { method: string; path: string; params: string }[] = [];

/** Sends a request to stripe-mock and answers with the story's version */
async function throughStripeMock(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : input);
  const method = init?.method ?? "GET";
  stripeRequests.push({
    method,
    path: url.pathname,
    params: decodeURIComponent(
      method === "GET" ? url.search.slice(1) : String(init?.body ?? ""),
    ),
  });

  const response = await fetch(input, init);
  const body = await response.json();
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(
    JSON.stringify(
      response.ok ? tellTheStory(method, url.pathname, body) : body,
    ),
    { status: response.status, headers },
  );
}

const getUser = jest.fn();
jest.mock("@/utils/supabase/server.ts", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

const captureException = jest.fn();
jest.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

// The database, kept in memory: the Stripe customers and subscriptions the
// routes save, with only the queries they make
interface SavedSubscription {
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  status: string;
  plan: string | null;
  stripePriceId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}
const customers: { supabaseUserId: string; stripeCustomerId: string }[] = [];
const subscriptions: SavedSubscription[] = [];
type CustomerWhere = { supabaseUserId?: string; stripeCustomerId?: string };
const fakePrisma = {
  stripeCustomer: {
    findUnique: async ({
      where,
      include,
    }: {
      where: CustomerWhere;
      include?: { Subscription?: boolean };
    }) => {
      const customer = customers.find(
        (c) =>
          c.supabaseUserId === where.supabaseUserId ||
          c.stripeCustomerId === where.stripeCustomerId,
      );
      if (!customer) return null;
      return include?.Subscription
        ? {
            ...customer,
            Subscription: subscriptions.filter(
              (s) => s.stripeCustomerId === customer.stripeCustomerId,
            ),
          }
        : customer;
    },
    upsert: async ({
      where,
      create,
    }: {
      where: { supabaseUserId: string };
      create: { supabaseUserId: string; stripeCustomerId: string };
    }) => {
      const index = customers.findIndex(
        (c) => c.supabaseUserId === where.supabaseUserId,
      );
      customers.splice(index === -1 ? customers.length : index, 1, create);
      return create;
    },
  },
  subscription: {
    upsert: async ({
      where,
      update,
      create,
    }: {
      where: { stripeSubscriptionId: string };
      update: Omit<
        SavedSubscription,
        "stripeSubscriptionId" | "stripeCustomerId"
      >;
      create: typeof update & {
        stripeSubscriptionId: string;
        customer: { connect: { stripeCustomerId: string } };
      };
    }) => {
      const saved = subscriptions.find(
        (s) => s.stripeSubscriptionId === where.stripeSubscriptionId,
      );
      if (saved) {
        Object.assign(saved, update);
        return saved;
      }
      const { customer, ...fields } = create;
      const added = {
        ...fields,
        stripeCustomerId: customer.connect.stripeCustomerId,
      };
      subscriptions.push(added);
      return added;
    },
  },
};
jest.mock("%/database/prisma.ts", () => ({ getPrisma: () => fakePrisma }));

// The routes' own Stripe client (utils/stripe/server.ts), sent to stripe-mock
jest.mock("stripe", () => {
  const actual = jest.requireActual("stripe");
  const RealStripe = actual.default ?? actual;
  class StripeThroughStripeMock extends RealStripe {
    constructor(key: string, config: object) {
      const mock = new URL(process.env.STRIPE_MOCK_URL!);
      super(key, {
        ...config,
        protocol: "http",
        host: mock.hostname,
        port: mock.port,
        httpClient: RealStripe.createFetchHttpClient(throughStripeMock),
      });
    }
  }
  return { __esModule: true, default: StripeThroughStripeMock };
});

import { GET as completeCheckout } from "@/app/api/stripe/(checkout-session)/checkout-complete/route.ts";
import { GET as startCheckout } from "@/app/api/stripe/(checkout-session)/get-checkout-session/route.ts";
import { GET as openPortal } from "@/app/api/stripe/(portal-session)/get-portal-session/route.ts";
import { POST as receiveWebhook } from "@/app/api/stripe/webhook/route.ts";
import { getSubscriptionStatus } from "@/utils/stripe/utils.ts";
import { SubscriptionStatus } from "@/utils/subscriptions.ts";
import { NextRequest } from "next/server";
import Stripe from "stripe";

if (!STRIPE_MOCK_URL && process.env.CI) {
  throw new Error(
    "CI runs stripe-mock for these tests; STRIPE_MOCK_URL is unset",
  );
}

/** A Stripe event about the subscription as Stripe holds it now, signed */
async function signedSubscriptionEvent(
  type: StripeType.Event.Type,
  secret = WEBHOOK_SECRET,
): Promise<NextRequest> {
  const stripe = new Stripe("sk_test_doppelganger");
  const subscription = await stripe.subscriptions.retrieve(SUBSCRIPTION);
  const payload = JSON.stringify({
    ...(await stripe.events.retrieve("evt_doppelganger")),
    type,
    data: { object: subscription },
  });
  return new NextRequest("https://doppelgangerhq.com/api/stripe/webhook", {
    method: "POST",
    body: payload,
    headers: {
      "stripe-signature": stripe.webhooks.generateTestHeaderString({
        payload,
        secret,
      }),
    },
  });
}

const env = process.env;

(STRIPE_MOCK_URL ? describe : describe.skip)(
  "subscribing, through stripe-mock",
  () => {
    beforeAll(() => {
      process.env = {
        ...env,
        STRIPE_SECRET: "sk_test_doppelganger",
        STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
        STRIPE_PORTAL_CONFIGURATION: "bpc_doppelganger",
      };
      // The routes log as they go; anything wrong is also reported to Sentry,
      // which each test checks
      jest.spyOn(console, "log").mockImplementation(() => {});
      jest.spyOn(console, "error").mockImplementation(() => {});
      getUser.mockResolvedValue({ data: { user: USER }, error: null });
    });

    beforeEach(() => {
      stripeRequests.length = 0;
    });

    afterEach(() => {
      expect(captureException).not.toHaveBeenCalled();
    });

    afterAll(() => {
      process.env = env;
    });

    it("starts a checkout for Plus, making the user a Stripe customer", async () => {
      const res = await startCheckout(
        new NextRequest(
          "https://doppelgangerhq.com/api/stripe/get-checkout-session?plan=plus",
        ),
      );

      expect(res.headers.get("location")).toBe(CHECKOUT_URL);
      expect(customers).toEqual([
        { supabaseUserId: USER.id, stripeCustomerId: CUSTOMER },
      ]);
      const checkout = stripeRequests.find(
        (r) => r.method === "POST" && r.path === "/v1/checkout/sessions",
      );
      expect(checkout?.params).toContain(`customer=${CUSTOMER}`);
      expect(checkout?.params).toContain(
        `line_items[0][price]=${PRICES.plus.id}`,
      );
    });

    it("saves the subscription when checkout completes", async () => {
      const res = await completeCheckout(
        new NextRequest(
          `https://doppelgangerhq.com/api/stripe/checkout-complete?session_id=${CHECKOUT_SESSION}`,
        ),
      );

      expect(new URL(res.headers.get("location")!).pathname).toBe("/devices");
      expect(subscriptions).toEqual([
        expect.objectContaining({
          stripeSubscriptionId: SUBSCRIPTION,
          stripeCustomerId: CUSTOMER,
          status: "active",
          plan: SubscriptionStatus.PLUS,
          stripePriceId: PRICES.plus.id,
        }),
      ]);
      expect(await getSubscriptionStatus(USER.id)).toBe(
        SubscriptionStatus.PLUS,
      );
    });

    it("follows the subscription through Stripe's signed webhooks", async () => {
      story.subscriptionStatus = "past_due";
      const pastDue = await receiveWebhook(
        await signedSubscriptionEvent("customer.subscription.updated"),
      );
      expect(pastDue.status).toBe(200);
      expect(subscriptions[0].status).toBe("past_due");
      expect(await getSubscriptionStatus(USER.id)).toBe(
        SubscriptionStatus.FREE,
      );

      story.subscriptionStatus = "active";
      const active = await receiveWebhook(
        await signedSubscriptionEvent("customer.subscription.updated"),
      );
      expect(active.status).toBe(200);
      expect(await getSubscriptionStatus(USER.id)).toBe(
        SubscriptionStatus.PLUS,
      );
    });

    it("turns away a webhook signed with another secret", async () => {
      const res = await receiveWebhook(
        await signedSubscriptionEvent(
          "customer.subscription.deleted",
          "whsec_someone_else",
        ),
      );

      expect(res.status).toBe(400);
      expect(subscriptions[0].status).toBe("active");
      // the endpoint's secret being out of date is reported
      expect(captureException).toHaveBeenCalledTimes(1);
      captureException.mockClear();
    });

    it("opens Doppelganger's customer portal for the subscriber", async () => {
      const res = await openPortal();

      expect(res.headers.get("location")).toBe(PORTAL_URL);
      const portal = stripeRequests.find(
        (r) => r.method === "POST" && r.path === "/v1/billing_portal/sessions",
      );
      expect(portal?.params).toContain(`customer=${CUSTOMER}`);
      expect(portal?.params).toContain("configuration=bpc_doppelganger");
    });
  },
);
