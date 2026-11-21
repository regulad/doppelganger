/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

const getUser = jest.fn();
const getDeviceForId = jest.fn();
const getStateRuntime = jest.fn();
const isInstalled = jest.fn();
const shell = jest.fn();
const captureException = jest.fn();

jest.mock("@/utils/supabase/server.ts", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
jest.mock("%/device-info/device-info.ts", () => ({
  getDeviceForId: (id: string) => getDeviceForId(id),
}));
jest.mock("%/adb/adb-device.ts", () => ({
  AdbDevice: jest.fn().mockImplementation(() => ({
    adbDeviceClient: { getStateRuntime, isInstalled, shell },
  })),
  readFullStreamIntoBuffer: async () => Buffer.alloc(0),
}));
jest.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

import { PUT } from "./route";

const location = {
  latitude: 28.8,
  longitude: -81.27,
  altitude: null,
  accuracy: 10,
  altitudeAccuracy: null,
  heading: null,
  speed: null,
  timestamp: 1_763_359_163_000,
};

const request = () =>
  new NextRequest("https://doppelgangerhq.com/api/devices/abc123/location", {
    method: "PUT",
    body: JSON.stringify(location),
  });

beforeEach(() => {
  jest.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "user1" } } });
  getDeviceForId.mockResolvedValue({ id: "abc123", ownerId: "user1" });
  getStateRuntime.mockResolvedValue("device");
  isInstalled.mockResolvedValue(true);
  shell.mockResolvedValue({});
});

describe("sending a location to a device", () => {
  it("hands it to Pheidippides Locate", async () => {
    const res = await PUT(request());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    expect(shell).toHaveBeenCalledWith(
      expect.stringContaining(
        "am start -n xyz.regulad.pheidippides.locate/.MockLocationActivity",
      ),
    );
  });

  it("waits only briefly for the device", async () => {
    await PUT(request());

    const { AdbDevice } = jest.requireMock("%/adb/adb-device.ts");
    expect(AdbDevice).toHaveBeenCalledWith(
      expect.objectContaining({ id: "abc123" }),
      10_000,
    );
  });

  it("drops the location, without reporting it, while the device can't be reached", async () => {
    getStateRuntime.mockRejectedValue(new Error("Device is not connected"));

    const res = await PUT(request());

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "The device isn't reachable right now",
    });
    expect(captureException).not.toHaveBeenCalled();
  });

  it("drops the location, without reporting it, while Android still boots", async () => {
    // DOPPELGANGER-DT: the device was up, but Android hadn't finished booting
    isInstalled.mockRejectedValue(
      new Error("Android is still booting after 10 s"),
    );

    const res = await PUT(request());

    expect(res.status).toBe(503);
    expect(captureException).not.toHaveBeenCalled();
  });

  it("answers with a JSON error, and reports it, when the command fails", async () => {
    const failed = new Error("Activity not started, unable to resolve Intent");
    shell.mockRejectedValue(failed);

    const res = await PUT(request());

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "Couldn't send the location to the device",
    });
    expect(captureException).toHaveBeenCalledWith(failed);
  });
});
