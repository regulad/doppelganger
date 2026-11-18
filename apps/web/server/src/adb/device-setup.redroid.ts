/**
 * @jest-environment node
 */

// A device's setup and its location, run against a real redroid device that
// CI starts ("Test device setup on redroid" in .github/workflows/ci-cd.yml).
// The setup is the server's own (initial-setup.ts), with the Pheidippides
// APKs this CI run built, and the location goes through the location route,
// which on a device that isn't an emulator hands it to Pheidippides Locate.
// Only the database, Redis and Sentry are stood in for, and the two packages
// setup finds its APKs with, which jest can't load (they're ES modules only).
//
// The file isn't named *.test.ts, so the usual test runs leave it out. To run
// it, connect adb to a redroid device, put the APKs in apps/web/android, and
// run `REDROID_ADB_SERIAL=localhost:5555 pnpm exec jest --testMatch
// '**/*.redroid.ts' --coverage=false` in apps/web.

import type { Device } from "%/generated/prisma/client.ts";

const SERIAL = process.env.REDROID_ADB_SERIAL;
if (!SERIAL) {
  throw new Error("REDROID_ADB_SERIAL names the redroid device to test on");
}
const [ADB_HOSTNAME, ADB_PORT] = SERIAL.split(":");

const DEVICE = {
  id: "redroid-test",
  ownerId: "owner",
  adbHostname: ADB_HOSTNAME,
  adbPort: Number(ADB_PORT),
  usesStableApks: true,
} as unknown as Device;

// What setup and the route would have reported to Sentry. The mocks read
// `reported` only when called: jest runs their factories as the imports below
// load, before this file's own statements.
const reported: unknown[] = [];
jest.mock("@sentry/node", () => ({
  ...jest.requireActual("@sentry/node"),
  captureException: (error: unknown) => reported.push(error),
}));
jest.mock("@sentry/nextjs", () => ({
  captureException: (error: unknown) => reported.push(error),
}));

// Setup's APKs are in apps/web/android, where jest runs from
jest.mock("find-up", () => ({
  findUpSync: (name: string) => jest.requireActual("node:path").resolve(name),
}));
jest.mock("globby", () => ({
  globby: async (pattern: string) => {
    const path = jest.requireActual("node:path");
    const dir = pattern.slice(0, pattern.indexOf("/**"));
    return (
      jest.requireActual("node:fs").readdirSync(dir, {
        recursive: true,
      }) as string[]
    )
      .filter((file) => file.endsWith(".apk"))
      .map((file) => path.join(dir, file));
  },
}));

// Setup takes a Redis lock per device; this is the only setup running
jest.mock("%/adb/setup-lock.ts", () => ({
  runDeviceSetupExclusively: (_id: string, setUp: () => Promise<void>) =>
    setUp(),
}));
jest.mock("%/docker/containers.ts", () => ({
  getIsDeviceStopped: async () => false,
  // for the context of an ADB failure's report
  getDeviceContainerStates: async () => ({}),
}));
jest.mock("%/device-info/device-info.ts", () => ({
  getDeviceForId: async (id: string) => (id === DEVICE.id ? DEVICE : null),
}));
jest.mock("@/utils/supabase/server.ts", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) },
  }),
}));

import { AdbDevice } from "%/adb/adb-device.ts";
import doInitialDeviceSetup from "%/adb/initial-setup.ts";
import { PUT as putLocation } from "@/app/api/devices/[id]/location/route.ts";
import { NextRequest } from "next/server";

const adb = new AdbDevice(DEVICE);
const shell = (command: string) => adb.runShellCommandAdbKit(command);

/** Waits for a shell command's output to match, or fails with the last one */
async function waitForShell(
  command: string,
  pattern: RegExp,
  timeoutMs = 60_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let output = "";
  while (Date.now() < deadline) {
    output = await shell(command);
    if (pattern.test(output)) {
      return output;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`\`${command}\` never matched ${pattern}:\n${output}`);
}

jest.setTimeout(15 * 60_000);

describe("a redroid device", () => {
  afterEach(() => {
    expect(reported).toEqual([]);
  });

  it("is set up for the Pheidippides apps", async () => {
    await doInitialDeviceSetup(DEVICE);

    expect(await shell("pm list packages xyz.regulad.pheidippides")).toEqual(
      expect.stringContaining("package:xyz.regulad.pheidippides.locate"),
    );
    // Locate may mock locations (PHEIDIPPIDES-LOCATE-E)
    expect(
      await shell(
        "appops get xyz.regulad.pheidippides.locate android:mock_location",
      ),
    ).toMatch(/MOCK_LOCATION: allow\b/);
    expect(await shell("settings get secure mock_location_app")).toBe(
      "xyz.regulad.pheidippides.locate",
    );
    // Notify reads notifications, and Administrate owns the device
    expect(await shell("cmd notification allowed_listeners")).toContain(
      "xyz.regulad.pheidippides.notify",
    );
    expect(await shell("dpm list-owners")).toContain(
      "xyz.regulad.pheidippides.administrate",
    );
  });

  it("gets the location Doppelganger sends it", async () => {
    for (const [latitude, longitude] of [
      [40.7128, -74.006],
      [34.0522, -118.2437],
    ]) {
      const res = await putLocation(
        new NextRequest(
          `https://doppelgangerhq.com/api/devices/${DEVICE.id}/location`,
          {
            method: "PUT",
            body: JSON.stringify({
              latitude,
              longitude,
              altitude: null,
              accuracy: 8,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
              timestamp: Date.now(),
            }),
          },
        ),
      );
      expect(res.status).toBe(200);

      // Android's own record of the location it last gave apps, as
      // Location[gps 40.712800,-74.006000 ...]
      await waitForShell(
        "dumpsys location",
        new RegExp(`${latitude.toFixed(6)},${longitude.toFixed(6)}`),
      );
    }
  });
});
