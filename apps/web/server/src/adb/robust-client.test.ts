/**
 * @jest-environment node
 */

import { readSentryContext } from "%/sentry/error-context.ts";
import { type Client, DeviceClient } from "@devicefarmer/adbkit";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
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
    // an Android that has booted, unless a test says otherwise
    jest
      .spyOn(DeviceClient.prototype, "waitForDevice")
      .mockResolvedValue(serial);
    jest
      .spyOn(DeviceClient.prototype, "waitBootComplete")
      .mockResolvedValue(true);
  });

  it("waits for Android to boot on a device another client connected", async () => {
    // adb's server is shared: setup had connected this device, and the
    // location route found it connected while Android still booted
    // (DOPPELGANGER-DT)
    const client = new RobustClient(mockClient, serial, 10_000);
    jest.spyOn(client, "getIsConnected").mockResolvedValue(true);
    const order: string[] = [];
    jest
      .spyOn(DeviceClient.prototype, "waitBootComplete")
      .mockImplementation(async () => {
        order.push("boot");
        return true;
      });
    jest
      .spyOn(DeviceClient.prototype, "isInstalled")
      .mockImplementation(async () => {
        order.push("isInstalled");
        return true;
      });

    await client.isInstalled("xyz.regulad.pheidippides.locate");
    await client.isInstalled("xyz.regulad.pheidippides.locate");

    // once, as it has seen Android booted
    expect(order).toEqual(["boot", "isInstalled", "isInstalled"]);
  });

  it("says Android is still booting when the time runs out waiting for it", async () => {
    const client = new RobustClient(mockClient, serial, 1_000);
    jest.spyOn(client, "getIsConnected").mockResolvedValue(true);
    let signal: AbortSignal | undefined;
    const waitBootComplete = jest
      .spyOn(DeviceClient.prototype, "waitBootComplete")
      .mockImplementation((options) => {
        signal = options?.signal;
        return new Promise((_, reject) =>
          signal?.addEventListener("abort", () =>
            reject(new Error("This operation was aborted")),
          ),
        );
      });
    const isInstalled = jest.spyOn(DeviceClient.prototype, "isInstalled");

    const error = await client
      .isInstalled("xyz.regulad.pheidippides.locate")
      .catch((e: unknown) => e);

    expect(error).toMatchObject({
      message: "Android is still booting after 1 s",
    });
    expect(isTransientAdbError(error)).toBe(true);
    expect(signal?.aborted).toBe(true);
    // the wait it stopped doesn't start another attempt once it fails
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(waitBootComplete).toHaveBeenCalledTimes(1);
    expect(isInstalled).not.toHaveBeenCalled();
  });

  it("still reports an operation that hangs on a booted Android", async () => {
    const client = new RobustClient(mockClient, serial, 300);
    jest.spyOn(client, "getIsConnected").mockResolvedValue(true);
    jest
      .spyOn(DeviceClient.prototype, "isInstalled")
      .mockReturnValue(new Promise(() => {}));

    const error = await client
      .isInstalled("xyz.regulad.pheidippides.locate")
      .catch((e: unknown) => e);

    expect(error).toMatchObject({
      message: "Retry timeout (attemptNum: 0, timeout: 300)",
      code: "ATTEMPT_TIMEOUT",
    });
    expect(isTransientAdbError(error)).toBe(false);
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

  it("says what failed when checking the device's state, too", async () => {
    // DOPPELGANGER-DH's failures came through here, and said nothing more
    jest.spyOn(reconnectingClient, "getIsConnected").mockResolvedValue(false);

    const error = await reconnectingClient
      .getStateRuntime()
      .catch((e: unknown) => e);
    const { tags, contexts } = readSentryContext(error);
    expect(tags).toEqual({ "adb.operation": "getState" });
    expect(contexts?.adb).toMatchObject({ serial, operation: "getState" });
  });

  it("adds Android's own state to a failure the device answered", async () => {
    jest.spyOn(reconnectingClient, "getIsConnected").mockResolvedValue(true);
    jest
      .spyOn(DeviceClient.prototype, "install")
      .mockRejectedValue(
        new Error(
          "java.lang.NullPointerException: Attempt to invoke virtual method 'java.util.List android.os.storage.StorageManager.getVolumes()' on a null object reference",
        ),
      );
    jest
      .spyOn(DeviceClient.prototype, "getProperties")
      .mockResolvedValue({ "sys.boot_completed": "1" });
    jest
      .spyOn(DeviceClient.prototype, "shell")
      .mockImplementation(
        async () =>
          Readable.from([Buffer.from("Service mount: not found\n")]) as never,
      );

    const error = await reconnectingClient
      .install("app-debug.apk")
      .catch((e: unknown) => e);
    const { contexts } = readSentryContext(error);
    expect(contexts?.android_state).toMatchObject({
      properties: { "sys.boot_completed": "1" },
      services: { mount: false },
    });
  });

  it("doesn't ask a device it couldn't reach about its state", async () => {
    jest.spyOn(reconnectingClient, "getIsConnected").mockResolvedValue(false);
    const getProperties = jest.spyOn(DeviceClient.prototype, "getProperties");

    const error = await reconnectingClient.reboot().catch((e: unknown) => e);
    expect(readSentryContext(error).contexts?.android_state).toBeUndefined();
    expect(getProperties).not.toHaveBeenCalled();
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

  it("pushes the APK again when its install is cut short", async () => {
    // As while Android's package manager settles after boot. adbkit deletes
    // the pushed APK whether its install worked or not, so a retry has to
    // push it again rather than retry the install alone.
    const bootingClient = new RobustClient(mockClient, serial, 10_000);
    jest.spyOn(bootingClient, "getIsConnected").mockResolvedValue(true);
    const push = jest
      .spyOn(DeviceClient.prototype, "push")
      .mockImplementation(async () => {
        const transfer = new EventEmitter();
        setImmediate(() => transfer.emit("end"));
        return transfer as never;
      });
    const installRemote = jest
      .spyOn(DeviceClient.prototype, "installRemote")
      .mockRejectedValueOnce(
        adbkitError(
          "PrematureEOFError",
          "Premature end of stream, needed 4 more bytes",
        ),
      )
      .mockResolvedValue(true);

    await expect(bootingClient.install("SystemWebView.apk")).resolves.toBe(
      true,
    );
    expect(push).toHaveBeenCalledTimes(2);
    expect(installRemote).toHaveBeenCalledTimes(2);
  });

  it("waits out adbd restarting when asked for root", async () => {
    // adbd answers a root request that arrives mid-restart with nothing
    const bootingClient = new RobustClient(mockClient, serial, 10_000);
    jest.spyOn(bootingClient, "getIsConnected").mockResolvedValue(true);
    const root = jest
      .spyOn(DeviceClient.prototype, "root")
      .mockRejectedValueOnce(new Error(""))
      .mockResolvedValue(true);

    await expect(bootingClient.root()).resolves.toBe(true);
    expect(root).toHaveBeenCalledTimes(2);
  });

  it("takes adbd already running as root as done", async () => {
    jest.spyOn(reconnectingClient, "getIsConnected").mockResolvedValue(true);
    const root = jest
      .spyOn(DeviceClient.prototype, "root")
      .mockRejectedValue(new Error("adbd is already running as root"));

    await expect(reconnectingClient.root()).resolves.toBe(true);
    expect(root).toHaveBeenCalledTimes(1);
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
      new Error("Android is still booting after 10 s"),
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
      Object.assign(
        new Error("Retry timeout (attemptNum: 0, timeout: 10000)"),
        {
          code: "ATTEMPT_TIMEOUT",
        },
      ),
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
