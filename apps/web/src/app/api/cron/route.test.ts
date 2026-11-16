// route.test.ts
import { getPrisma } from "%/database/prisma.ts";
import { bringDownDevice, getIsDeviceRunning } from "%/docker/device-state.ts";
import { reconcileSubscriptions } from "@/utils/stripe/reconcile.ts";
import { getSubscriptionStatus } from "@/utils/stripe/utils.ts";
import { SubscriptionStatus } from "@/utils/subscriptions.ts";
import { GET } from "./route";

jest.mock("%/database/prisma.ts", () => ({
  getPrisma: jest.fn().mockReturnValue({
    device: {
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    stripeCustomer: {
      findUnique: jest.fn(),
    },
  }),
}));

jest.mock("next/server", () => ({
  NextResponse: {
    json: jest.fn(),
  },
}));

jest.mock("@/utils/stripe/utils.ts", () => ({
  getSubscriptionStatus: jest.fn(),
}));

jest.mock("@/utils/stripe/reconcile.ts", () => ({
  reconcileSubscriptions: jest.fn(),
}));

jest.mock("%/docker/device-state.ts", () => ({
  bringDownDevice: jest.fn(),
  getIsDeviceRunning: jest.fn(),
}));

describe("GET function in route.ts", () => {
  it("should handle devices correctly based on subscription status", async () => {
    const prisma = getPrisma();

    // Mock responses
    // @ts-expect-error -- testing purposes
    prisma.device.findMany.mockResolvedValue([
      { id: "device1", ownerId: "owner1", lastConnectedAt: new Date() },
    ]);
    // @ts-expect-error -- testing purposes
    getSubscriptionStatus.mockResolvedValue(SubscriptionStatus.PRO);
    // @ts-expect-error -- testing purposes
    getIsDeviceRunning.mockResolvedValue(true);
    // @ts-expect-error -- testing purposes
    bringDownDevice.mockResolvedValue(undefined);
    ``;
    // Call the function

    // @ts-expect-error -- testing purposes
    await GET(null);

    // Assertions
    expect(prisma.device.findMany).toHaveBeenCalled();
    expect(getSubscriptionStatus).toHaveBeenCalledWith("owner1");
    expect(getIsDeviceRunning).not.toHaveBeenCalled();
    expect(bringDownDevice).not.toHaveBeenCalled();
  });

  it("should call bringDownDevice for devices with inactive subscription past the idle time", async () => {
    const prisma = getPrisma();

    // Mock the current time to ensure consistent test behavior
    jest.useFakeTimers().setSystemTime(new Date("2023-01-01T12:00:00Z"));

    // Mock responses
    const pastTime = new Date("2023-01-01T11:00:00Z"); // 1 hour in the past
    // @ts-expect-error -- testing purposes
    prisma.device.findMany.mockResolvedValue([
      { id: "device2", ownerId: "owner2", lastConnectedAt: pastTime },
    ]);
    // @ts-expect-error -- testing purposes
    getSubscriptionStatus.mockResolvedValue(SubscriptionStatus.FREE);
    // @ts-expect-error -- testing purposes
    getIsDeviceRunning.mockResolvedValue(true);

    // Call the function
    // @ts-expect-error -- testing purposes
    await GET(null);

    // Assertions
    expect(prisma.device.findMany).toHaveBeenCalled();
    expect(getSubscriptionStatus).toHaveBeenCalledWith("owner2");
    expect(getIsDeviceRunning).toHaveBeenCalled();
    expect(bringDownDevice).toHaveBeenCalledWith("device2"); // Check if bringDownDevice was called with any argument

    jest.useRealTimers(); // Reset timers after the test
  });

  describe("reconciling with Stripe", () => {
    beforeEach(() => {
      const prisma = getPrisma();
      // @ts-expect-error -- testing purposes
      prisma.device.findMany.mockResolvedValue([]);
      // @ts-expect-error -- testing purposes
      reconcileSubscriptions.mockReset();
    });

    afterEach(() => jest.useRealTimers());

    it("happens every 15 minutes", async () => {
      // @ts-expect-error -- testing purposes
      reconcileSubscriptions.mockResolvedValue({
        saved: 0,
        ended: 0,
        missing: 0,
      });

      jest.useFakeTimers().setSystemTime(new Date("2026-11-16T12:07:00Z"));
      // @ts-expect-error -- testing purposes
      await GET(null);
      expect(reconcileSubscriptions).not.toHaveBeenCalled();

      jest.setSystemTime(new Date("2026-11-16T12:45:00Z"));
      // @ts-expect-error -- testing purposes
      await GET(null);
      expect(reconcileSubscriptions).toHaveBeenCalledTimes(1);
    });

    it("doesn't stop the run when it fails", async () => {
      jest.spyOn(console, "error").mockImplementation(() => {});
      // @ts-expect-error -- testing purposes
      reconcileSubscriptions.mockRejectedValue(new Error("Stripe is down"));
      jest.useFakeTimers().setSystemTime(new Date("2026-11-16T12:30:00Z"));

      // @ts-expect-error -- testing purposes
      await expect(GET(null)).resolves.not.toThrow();
      expect(getPrisma().device.findMany).toHaveBeenCalled();
    });
  });
});
