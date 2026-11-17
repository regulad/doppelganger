import { DeviceClient } from "%/adb/adb.ts";
import { getDeviceContainerStates } from "%/docker/containers.ts";
import { withSentryContext } from "%/sentry/error-context.ts";
import { resolveOrDefaultValue } from "%/utils/promise-utils.ts";
import {
  type DeviceClient as AdbDeviceClient,
  type Client,
  type Device,
  type Features,
  type Forward,
  type FramebufferStreamWithMeta,
  type MonkeyClient,
  type Reverse,
  type StartActivityOptions,
  type StartServiceOptions,
  type WithToString,
} from "@devicefarmer/adbkit";
import { retry } from "@lifeomic/attempt";
import { Duplex, Readable } from "node:stream";

// adbkit's package exports leave these types out, so they're read off the
// methods that return them
type Resolved<M extends keyof AdbDeviceClient> = AdbDeviceClient[M] extends (
  ...args: never[]
) => Promise<infer T>
  ? T
  : never;
type Logcat = Resolved<"openLogcat">;
type JdwpTracker = Resolved<"trackJdwp">;
type ProcStat = Resolved<"openProcStat">;
type Sync = Resolved<"syncService">;
type Stats = Resolved<"stat">;
type Entry = Resolved<"readdir">[number];
type PullTransfer = Resolved<"pull">;

export const DEFAULT_ADB_TIMEOUT = 5 * 60 * 1_000; // so much time 🔥

type DeviceState = Device["type"];

/**
 * Extention of the ADB client that proves a connection before running commands.
 * Useful for the edge and resource-constricted envuronments.
 */
export default class RobustClient extends DeviceClient {
  readonly timeout: number;

  constructor(
    client: Client,
    serial: string,
    timeout: number = DEFAULT_ADB_TIMEOUT,
    // The device this client talks to, so a failure can say what state its
    // containers were in
    readonly deviceId?: string,
  ) {
    super(client, serial);
    this.timeout = timeout;
  }

  /**
   * Connects, then runs an operation, retrying both until they succeed or the
   * timeout passes. A final failure carries Sentry context: the device, the
   * operation, how many attempts it took and for how long, and what Docker
   * says about the device's containers at that moment.
   */
  private async withConnection<T>(
    operation: string,
    run: () => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();
    let attempts = 0;
    try {
      return await retry(
        async () => {
          attempts++;
          await this.connectRobust();
          return run();
        },
        {
          timeout: this.timeout,
        },
      );
    } catch (error: unknown) {
      const containers = this.deviceId
        ? await getDeviceContainerStates(this.deviceId)
        : undefined;
      throw withSentryContext(error, {
        tags: {
          "adb.operation": operation,
          ...(this.deviceId ? { "device.id": this.deviceId } : {}),
        },
        contexts: {
          adb: {
            serial: this.serial,
            operation,
            attempts,
            elapsed_s: Math.round((Date.now() - startedAt) / 1000),
          },
          ...(containers ? { device_containers: containers } : {}),
        },
      });
    }
  }

  async doConnect(): Promise<void> {
    // only works with tcp hosts
    const [host, port] = this.serial.split(":");
    await this.client.connect(host, parseInt(port, 10));
  }

  async connectRobust(): Promise<void> {
    // keep trying to run connect until either the timeout is reached or the device is connected
    const startTime = Date.now();
    let connected = await this.getIsConnected();
    if (connected) return;

    await retry(
      async () => {
        await this.doConnect();
        connected = await this.getIsConnected();
        if (!connected) {
          throw new Error(`Device is not connected`);
        }
      },
      {
        timeout: this.timeout,
      },
    );

    await this.waitForDevice();
    await this.waitBootComplete();
  }

  async getIsConnected(): Promise<boolean> {
    const state = (await resolveOrDefaultValue(
      this.getState(),
      "offline",
      false,
    )) as DeviceState; // this throws if we are offline
    return state === "device" || state === "emulator";
  }

  /**
   * Get the state (moreso type) of the device after it has been connected
   */
  getStateRuntime(): Promise<"device" | "emulator"> {
    return retry(
      async () => {
        await this.connectRobust();
        const maybeState = await this.getState();
        if (maybeState === "device" || maybeState === "emulator") {
          return maybeState;
        }
        throw new Error(
          `Device is not in a connected state, expected device or emulator but got ${maybeState}`,
        );
      },
      {
        timeout: this.timeout,
      },
    );
  }

  /* overridden methods */

  // we can't define getState because it would cause a recursive call

  install(apk: string | Readable): Promise<boolean> {
    return this.withConnection("install", () => super.install(apk));
  }

  uninstall(packageName: string): Promise<boolean> {
    return this.withConnection("uninstall", () => super.uninstall(packageName));
  }

  shell(command: string | ArrayLike<WithToString>): Promise<Duplex> {
    return this.withConnection("shell", () => super.shell(command));
  }

  isInstalled(packageName: string): Promise<boolean> {
    return this.withConnection("isInstalled", () =>
      super.isInstalled(packageName),
    );
  }

  getProperties(): Promise<Record<string, string>> {
    return this.withConnection("getProperties", () => super.getProperties());
  }

  getFeatures(): Promise<Features> {
    return this.withConnection("getFeatures", () => super.getFeatures());
  }

  getDHCPIpAddress(iface?: string): Promise<string> {
    return this.withConnection("getDHCPIpAddress", () =>
      super.getDHCPIpAddress(iface),
    );
  }

  forward(local: string, remote: string): Promise<boolean> {
    return this.withConnection("forward", () => super.forward(local, remote));
  }

  listForwards(): Promise<Forward[]> {
    return this.withConnection("listForwards", () => super.listForwards());
  }

  reverse(remote: string, local: string): Promise<boolean> {
    return this.withConnection("reverse", () => super.reverse(remote, local));
  }

  listReverses(): Promise<Reverse[]> {
    return this.withConnection("listReverses", () => super.listReverses());
  }

  reboot(): Promise<boolean> {
    return this.withConnection("reboot", () => super.reboot());
  }

  remount(): Promise<boolean> {
    return this.withConnection("remount", () => super.remount());
  }

  root(): Promise<boolean> {
    return this.withConnection("root", () => super.root());
  }

  trackJdwp(): Promise<JdwpTracker> {
    return this.withConnection("trackJdwp", () => super.trackJdwp());
  }

  framebuffer(format?: string): Promise<FramebufferStreamWithMeta> {
    return this.withConnection("framebuffer", () => super.framebuffer(format));
  }

  screencap(): Promise<Duplex> {
    return this.withConnection("screencap", () => super.screencap());
  }

  openLocal(path: string): Promise<Duplex> {
    return this.withConnection("openLocal", () => super.openLocal(path));
  }

  openLog(name: string): Promise<Duplex> {
    return this.withConnection("openLog", () => super.openLog(name));
  }

  openTcp(port: number): Promise<Duplex> {
    return this.withConnection("openTcp", () => super.openTcp(port));
  }

  openMonkey(port?: number): Promise<MonkeyClient> {
    return this.withConnection("openMonkey", () => super.openMonkey(port));
  }

  openLogcat(options?: { clear?: boolean }): Promise<Logcat> {
    return this.withConnection("openLogcat", () => super.openLogcat(options));
  }

  openProcStat(): Promise<ProcStat> {
    return this.withConnection("openProcStat", () => super.openProcStat());
  }

  clear(packageName: string): Promise<boolean> {
    return this.withConnection("clear", () => super.clear(packageName));
  }

  installRemote(packagePath: string): Promise<boolean> {
    return this.withConnection("installRemote", () =>
      super.installRemote(packagePath),
    );
  }

  startActivity(options: StartActivityOptions): Promise<boolean> {
    return this.withConnection("startActivity", () =>
      super.startActivity(options),
    );
  }

  startService(options: StartServiceOptions): Promise<boolean> {
    return this.withConnection("startService", () =>
      super.startService(options),
    );
  }

  syncService(): Promise<Sync> {
    return this.withConnection("syncService", () => super.syncService());
  }

  stat(path: string): Promise<Stats> {
    return this.withConnection("stat", () => super.stat(path));
  }

  readdir(path: string): Promise<Entry[]> {
    return this.withConnection("readdir", () => super.readdir(path));
  }

  pull(path: string): Promise<PullTransfer> {
    return this.withConnection("pull", () => super.pull(path));
  }
}
