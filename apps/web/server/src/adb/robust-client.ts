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
 * Whether an ADB failure means the device can't be reached yet, as while its
 * Android boots, rather than that the operation itself failed: adbd refusing
 * or dropping the connection, adb's server reporting the device offline or
 * missing, or a reply cut short (adbkit's PrematureEOFError, which is also what
 * an install gets while Android's package manager isn't up yet).
 */
export function isTransientAdbError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === "PrematureEOFError") {
    return true;
  }
  return /Device is not connected|Connection refused|ECONNREFUSED|ECONNRESET|EPIPE|failed to connect|Failure: '(closed|device offline|device still (connecting|authorizing))'|device '[^']*' not found/i.test(
    error.message,
  );
}

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
   * Runs an attempt until it succeeds. A failure that means the device isn't
   * reachable yet (isTransientAdbError), as while Android boots, is retried
   * until this client's timeout has passed, backing off to 5 seconds between
   * attempts; any other failure gets three attempts in all. @lifeomic/attempt's
   * `timeout` bounds each attempt, not the whole retry, and its attempts
   * default to three about 200 ms apart, so a device still booting used to
   * fail in about two seconds, whatever the timeout said.
   */
  private retryUntilReachable<T>(attempt: () => Promise<T>): Promise<T> {
    const deadline = Date.now() + this.timeout;
    return retry(attempt, {
      maxAttempts: 0, // until handleError stops it
      delay: 250,
      factor: 1.5,
      maxDelay: 5_000,
      timeout: this.timeout, // and no single attempt outlasts the whole wait
      handleError: (error, context) => {
        if (
          isTransientAdbError(error)
            ? Date.now() >= deadline
            : context.attemptNum >= 2
        ) {
          context.abort();
        }
      },
    });
  }

  /**
   * Connects, then runs an operation, retrying both as retryUntilReachable
   * does. A final failure carries Sentry context: the device, the operation,
   * how many attempts it took and for how long, and what Docker says about the
   * device's containers at that moment.
   */
  private async withConnection<T>(
    operation: string,
    run: () => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();
    let attempts = 0;
    try {
      return await this.retryUntilReachable(async () => {
        attempts++;
        await this.connectOnce();
        return run();
      });
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

  /**
   * Connects once, unless already connected, and on a new connection waits for
   * Android to finish booting. Throws "Device is not connected", which
   * retryUntilReachable waits out, while adbd isn't up yet.
   */
  private async connectOnce(): Promise<void> {
    if (await this.getIsConnected()) return;

    await this.doConnect();
    if (!(await this.getIsConnected())) {
      throw new Error(`Device is not connected`);
    }

    await this.waitForDevice();
    await this.waitBootComplete();
  }

  /** Connects, waiting out a device that isn't reachable yet. */
  async connectRobust(): Promise<void> {
    await this.retryUntilReachable(() => this.connectOnce());
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
    return this.retryUntilReachable(async () => {
      await this.connectOnce();
      const maybeState = await this.getState();
      if (maybeState === "device" || maybeState === "emulator") {
        return maybeState;
      }
      throw new Error(
        `Device is not in a connected state, expected device or emulator but got ${maybeState}`,
      );
    });
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
