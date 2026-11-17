/**
 * @jest-environment node
 */

import { readSentryContext } from "%/sentry/error-context.ts";
import { type Client, DeviceClient } from "@devicefarmer/adbkit";
import RobustClient, { isTransientAdbError } from "./robust-client.ts";

const mockClient = {
  connect: jest.fn(),
  getState: jest.fn(),
  waitForDevice: jest.fn(),
  waitBootComplete: jest.fn(),
} as unknown as Client;

const serial = "127.0.0.1:5555";
const timeout = 1000;
const reconnectingClient = new RobustClient(mockClient, serial, timeout);

// adbkit's own errors, as its parser throws them
function adbkitError(name: string, message: string): Error {
  return Object.assign(new Error(message), { name });
}

describe("ReconnectingAdbDeviceClient", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it("throws error on install when timeout is reached", async () => {
    jest.spyOn(reconnectingClient, "getIsConnected").mockResolvedValue(false);

    const apk = "path/to/apk";
    await expect(reconnectingClient.install(apk)).rejects.toThrow(
      "Device is not connected",
    );
  });

  it("throws error on reboot when timeout is reached", async () => {
    jest.spyOn(reconnectingClient, "getIsConnected").mockResolvedValue(false);

    await expect(reconnectingClient.reboot()).rejects.toThrow(
      "Device is not connected",
    );
  });

  it("says what failed, and how, in the error's Sentry context", async () => {
    jest.spyOn(reconnectingClient, "getIsConnected").mockResolvedValue(false);

    const error = await reconnectingClient.reboot().catch((e: unknown) => e);
    const { tags, contexts } = readSentryContext(error);
    expect(tags).toEqual({ "adb.operation": "reboot" });
    expect(contexts?.adb).toMatchObject({
      serial,
      operation: "reboot",
      attempts: expect.any(Number),
    });
    // no device ID, so no containers to ask Docker about
    expect(contexts?.device_containers).toBeUndefined();
  });

  it("waits out a device that isn't reachable yet until the timeout", async () => {
    jest.spyOn(reconnectingClient, "getIsConnected").mockResolvedValue(false);

    const startedAt = Date.now();
    await expect(reconnectingClient.reboot()).rejects.toThrow(
      "Device is not connected",
    );
    // three quick attempts used to give up in well under half a second
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(timeout);
  });

  it("goes ahead once a booting device becomes reachable", async () => {
    // adbd comes up on the fifth check, as it does a while into Android's boot
    const getIsConnected = jest
      .spyOn(reconnectingClient, "getIsConnected")
      .mockResolvedValue(true);
    for (let i = 0; i < 4; i++) getIsConnected.mockResolvedValueOnce(false);
    jest.spyOn(DeviceClient.prototype, "reboot").mockResolvedValue(true);

    await expect(reconnectingClient.reboot()).resolves.toBe(true);
    expect(getIsConnected.mock.calls.length).toBeGreaterThan(3);
  });

  it("waits out a reply cut short, as an install gets while Android boots", async () => {
    // time enough for four backed-off retries
    const bootingClient = new RobustClient(mockClient, serial, 10_000);
    jest.spyOn(bootingClient, "getIsConnected").mockResolvedValue(true);
    const install = jest
      .spyOn(DeviceClient.prototype, "install")
      .mockResolvedValue(true);
    for (let i = 0; i < 4; i++) {
      install.mockRejectedValueOnce(
        adbkitError(
          "PrematureEOFError",
          "Premature end of stream, needed 1 more bytes",
        ),
      );
    }

    await expect(bootingClient.install("app.apk")).resolves.toBe(true);
    expect(install).toHaveBeenCalledTimes(5);
  });

  it("gives any other failure three attempts", async () => {
    jest.spyOn(reconnectingClient, "getIsConnected").mockResolvedValue(true);
    const failure = Object.assign(
      new Error(
        "app.apk could not be installed [INSTALL_FAILED_UPDATE_INCOMPATIBLE]",
      ),
      { code: "INSTALL_FAILED_UPDATE_INCOMPATIBLE" },
    );
    const install = jest
      .spyOn(DeviceClient.prototype, "install")
      .mockRejectedValue(failure);

    await expect(reconnectingClient.install("app.apk")).rejects.toBe(failure);
    expect(install).toHaveBeenCalledTimes(3);
  });
});

describe("isTransientAdbError", () => {
  it("recognizes a device that isn't reachable yet", () => {
    for (const error of [
      new Error("Device is not connected"),
      new Error("failed to connect to 'abc-redroid:5555': Connection refused"),
      adbkitError(
        "PrematureEOFError",
        "Premature end of stream, needed 4 more bytes",
      ),
      adbkitError("FailError", "Failure: 'closed'"),
      adbkitError("FailError", "Failure: 'device offline'"),
      adbkitError(
        "FailError",
        "Failure: 'device 'abc-redroid:5555' not found'",
      ),
      Object.assign(new Error("connect ECONNREFUSED 172.18.0.5:5555"), {
        code: "ECONNREFUSED",
      }),
    ]) {
      expect(isTransientAdbError(error)).toBe(true);
    }
  });

  it("leaves the operation's own failures alone", () => {
    for (const error of [
      new Error(
        "app.apk could not be installed [INSTALL_FAILED_UPDATE_INCOMPATIBLE]",
      ),
      adbkitError("FailError", "Failure: 'unknown command'"),
      new Error(
        "Device is not in a connected state, expected device or emulator but got unauthorized",
      ),
      "Device is not connected",
      undefined,
    ]) {
      expect(isTransientAdbError(error)).toBe(false);
    }
  });
});
