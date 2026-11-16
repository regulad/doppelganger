import { BASE_ORIGIN } from "%/constants.ts";
import { getPrisma } from "%/database/prisma.ts";
import { bringDownDevice, getIsDeviceRunning } from "%/docker/device-state.ts";
import { Device } from "%/generated/prisma/client.ts";
import { getDeviceIsActive } from "@/utils/devices.ts";
import { getSubscriptionStatus } from "@/utils/stripe/utils.ts";
import { SubscriptionStatus } from "@/utils/subscriptions.ts";
import * as OneSignal from "@onesignal/node-onesignal";
import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";

// fsr ci tries to ssr this route, but it is cron
export const dynamic = "force-dynamic";

async function sendDeviceDeletedNotification(device: Device): Promise<void> {
  const destinationNotification = new OneSignal.Notification();
  destinationNotification.app_id = process.env.ONESIGNAL_APP_ID!;
  destinationNotification.include_aliases = { external_id: [device.ownerId] };
  destinationNotification.target_channel = "push";

  // prompt the user to upgrade
  destinationNotification.headings = {
    en: "Your device has been shut down!",
  };
  destinationNotification.contents = {
    en: "Upgrade to Pro to run your device in the background.",
  };
  destinationNotification.priority = 10;
  destinationNotification.web_url = `${BASE_ORIGIN}/subscribe`;
}

// The cron run has blocked the event loop for over 5 s at least once. Its
// phases are spans, so a slow run's trace shows which one took the time.

async function shutdownAbandonedDevice(device: Device): Promise<void> {
  const deviceRunning = await Sentry.startSpan(
    { name: "Ask Docker whether the device is running", op: "cron.docker" },
    () => getIsDeviceRunning(device),
  );

  if (!deviceRunning) {
    return; // no need to process
  }

  const deviceActive = getDeviceIsActive(device);

  if (deviceActive) {
    return; // not yet time to shutdown
  }

  // shutdown the device
  await Sentry.startSpan(
    { name: "Shut the device down", op: "cron.docker" },
    () => bringDownDevice(device.id),
  );

  // todo: kinggrand
  sendDeviceDeletedNotification(device).catch((e) => {
    console.error("Failed to send device deleted notification", e);
    Sentry.captureException(e);
  });
}

async function handleOwner(ownerId: string, devices: Device[]): Promise<void> {
  const subscriptionStatus = await Sentry.startSpan(
    { name: "Look up the owner's subscription", op: "cron.subscription" },
    () => getSubscriptionStatus(ownerId),
  );

  if (
    subscriptionStatus === SubscriptionStatus.PRO ||
    subscriptionStatus === SubscriptionStatus.PLUS
  ) {
    // do nothing, their devices are allowed to run in the background
    return;
  }

  const devicePromises = devices.map((device) =>
    Sentry.startSpan(
      {
        name: "Check whether a device should keep running",
        op: "cron.device",
        attributes: { "device.id": device.id },
      },
      () => shutdownAbandonedDevice(device),
    ),
  );

  await Promise.all(devicePromises);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const prisma = getPrisma();

  const allDevices = await Sentry.startSpan(
    { name: "Load every device", op: "cron.db" },
    () =>
      prisma.device.findMany({
        where: {
          id:
            process.env.NODE_ENV === "production"
              ? { not: { endsWith: "staging" } }
              : { endsWith: "staging" },
        },
      }),
  );

  // group the devices by ownerId
  const devicesByOwner = allDevices.reduce(
    (acc, device) => {
      if (!acc[device.ownerId]) {
        acc[device.ownerId] = [];
      }
      acc[device.ownerId].push(device);
      return acc;
    },
    {} as Record<string, Device[]>,
  );

  Sentry.getActiveSpan()?.setAttributes({
    "devices.count": allDevices.length,
    "owners.count": Object.keys(devicesByOwner).length,
  });

  // handle each owner
  const devicePromises = Object.keys(devicesByOwner).map((ownerId) =>
    Sentry.startSpan(
      {
        name: "Check an owner's devices",
        op: "cron.owner",
        attributes: { "devices.count": devicesByOwner[ownerId].length },
      },
      () => handleOwner(ownerId, devicesByOwner[ownerId]),
    ),
  );

  await Promise.all(devicePromises);

  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
