/**
 * @jest-environment node
 */

import { readSentryContext } from "%/sentry/error-context.ts";
import { type Client } from "@devicefarmer/adbkit";
import RobustClient from "./robust-client.ts";

const mockClient = {
  connect: jest.fn(),
  getState: jest.fn(),
  waitForDevice: jest.fn(),
  waitBootComplete: jest.fn(),
} as unknown as Client;

const serial = "127.0.0.1:5555";
const timeout = 1000;
const reconnectingClient = new RobustClient(mockClient, serial, timeout);

describe("ReconnectingAdbDeviceClient", () => {
  beforeEach(() => {
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
      attempts: 3,
    });
    // no device ID, so no containers to ask Docker about
    expect(contexts?.device_containers).toBeUndefined();
  });
});
