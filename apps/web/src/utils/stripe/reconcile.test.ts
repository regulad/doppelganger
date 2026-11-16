/**
 * @jest-environment node
 */

jest.mock("server-only", () => ({}));

const findMany = jest.fn();
const update = jest.fn();
const list = jest.fn();
const saveSubscription = jest.fn();
const syncSubscription = jest.fn();

jest.mock("%/database/prisma.ts", () => ({
  getPrisma: () => ({ subscription: { findMany, update } }),
}));
jest.mock("@/utils/stripe/server.ts", () => ({
  __esModule: true,
  default: async () => ({ subscriptions: { list } }),
}));
jest.mock("@/utils/stripe/plans.ts", () => ({
  getPlanPrices: async () => [],
}));
jest.mock("@/utils/stripe/sync.ts", () => ({
  saveSubscription: (...args: unknown[]) => saveSubscription(...args),
  syncSubscription: (...args: unknown[]) => syncSubscription(...args),
}));

import { reconcileSubscriptions } from "./reconcile";

// stripe.subscriptions.list pages through every subscription with for await
function listing(...ids: string[]) {
  return (async function* () {
    for (const id of ids) {
      yield { id };
    }
  })();
}

beforeEach(() => {
  for (const mock of [
    findMany,
    update,
    list,
    saveSubscription,
    syncSubscription,
  ]) {
    mock.mockReset();
  }
});

describe("reconcileSubscriptions", () => {
  it("saves every subscription Stripe lists, skipping other products'", async () => {
    list.mockReturnValue(listing("sub_ours", "sub_theirs"));
    saveSubscription.mockImplementation(async ({ id }) =>
      id === "sub_ours" ? "saved" : "not-ours",
    );
    findMany.mockResolvedValue([]);

    await expect(reconcileSubscriptions()).resolves.toEqual({
      saved: 1,
      ended: 0,
      missing: 0,
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: { notIn: ["canceled", "incomplete_expired"] },
        stripeSubscriptionId: { notIn: ["sub_ours", "sub_theirs"] },
      },
    });
  });

  it("fetches a running subscription Stripe no longer lists", async () => {
    list.mockReturnValue(listing());
    findMany.mockResolvedValue([{ id: "row1", stripeSubscriptionId: "sub_1" }]);
    syncSubscription.mockResolvedValue("saved");

    await expect(reconcileSubscriptions()).resolves.toMatchObject({ ended: 1 });
    expect(syncSubscription).toHaveBeenCalledWith(
      expect.anything(),
      "sub_1",
      [],
    );
  });

  it("cancels a subscription that isn't on the account", async () => {
    list.mockReturnValue(listing());
    findMany.mockResolvedValue([
      { id: "row1", stripeSubscriptionId: "sub_old" },
    ]);
    syncSubscription.mockRejectedValue(
      Object.assign(new Error("No such subscription"), {
        code: "resource_missing",
      }),
    );

    await expect(reconcileSubscriptions()).resolves.toMatchObject({
      missing: 1,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "row1" },
      data: { status: "canceled" },
    });
  });

  it("stops on any other failure", async () => {
    list.mockReturnValue(listing());
    findMany.mockResolvedValue([{ id: "row1", stripeSubscriptionId: "sub_1" }]);
    syncSubscription.mockRejectedValue(new Error("Stripe is down"));

    await expect(reconcileSubscriptions()).rejects.toThrow("Stripe is down");
    expect(update).not.toHaveBeenCalled();
  });
});
