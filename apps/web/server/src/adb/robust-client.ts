import { DeviceClient } from "%/adb/adb.ts";
import { getAndroidState } from "%/adb/android-state.ts";
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

const ADBD_RESTARTING = "adbd closed the connection without a reply";

const ANDROID_BOOTING = "Android is still booting";

type DeviceState = Device["type"];

/** What an attempt is doing, so that running out of time can say */
interface AttemptProgress {
  /** Set while it waits for Android to finish booting, to stop that wait */
  booting?: AbortController;
}

/**
 * Whether an ADB failure means the device can't be reached yet, as while its
 * Android boots, rather than that the operation itself failed: adbd refusing
 * or dropping the connection, adb's server reporting the device offline or
 * missing, a reply cut short (adbkit's PrematureEOFError, which is also what
 * an install gets while Android's package manager isn't up yet), or Android
 * not done booting when the time ran out.
 */
export function isTransientAdbError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === "PrematureEOFError") {
    return true;
  }
  return /Device is not connected|adbd closed the connection without a reply|Android is still booting|Connection refused|ECONNREFUSED|ECONNRESET|EPIPE|failed to connect|Failure: '(closed|device offline|device still (connecting|authorizing))'|device '[^']*' not found/i.test(
    error.message,
  );
}

/**
 * Extention of the ADB client that proves a connection before running commands.
 * Useful for the edge and resource-constricted envuronments.
 */
export default class RobustClient extends DeviceClient {
  readonly timeout: number;

  /**
   * The same device, without this class's retries. Each operation runs on it,
   * so a retry repeats the whole operation. adbkit's operations call the
   * client's other methods as they go: install pushes the APK, then calls
   * installRemote, which installs it and always deletes it. Run on this
   * client, installRemote would retry on its own after the APK was deleted,
   * and fail with "Can't open file".
   */
  private readonly direct: AdbDeviceClient;

  /** Whether this client has seen Android finish booting */
  private booted = false;

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
    this.direct = new DeviceClient(client, serial);
  }

  /**
   * Runs an attempt until it succeeds. A failure that means the device isn't
   * reachable yet (isTransientAdbError), as while Android boots, is retried
   * until this client's timeout has passed, backing off to 5 seconds between
   * attempts; any other failure gets three attempts in all. @lifeomic/attempt's
   * `timeout` bounds each attempt, not the whole retry, and its attempts
   * default to three about 200 ms apart, so a device still booting used to
   * fail in about two seconds, whatever the timeout said.
   *
   * An attempt that runs out of time while it waits for Android to boot fails
   * with "Android is still booting", which isTransientAdbError takes as the
   * device not being reachable yet. One that runs out of time in the
   * operation itself fails as @lifeomic/attempt's own timeout does.
   */
  private retryUntilReachable<T>(
    attempt: (progress: AttemptProgress) => Promise<T>,
  ): Promise<T> {
    const deadline = Date.now() + this.timeout;
    const progress: AttemptProgress = {};
    return retry(() => attempt(progress), {
      maxAttempts: 0, // until handleError stops it
      delay: 250,
      factor: 1.5,
      maxDelay: 5_000,
      timeout: this.timeout, // and no single attempt outlasts the whole wait
      // A timeout skips handleError: the retry ends with what this throws
      handleTimeout: (context) => {
        // The attempt left running still reaches handleError when it fails,
        // and would start another attempt after the caller had its error
        context.abort();
        if (progress.booting) {
          progress.booting.abort();
          throw new Error(
            `${ANDROID_BOOTING} after ${Math.round(this.timeout / 1000)} s`,
          );
        }
        throw Object.assign(
          new Error(
            `Retry timeout (attemptNum: ${context.attemptNum}, timeout: ${this.timeout})`,
          ),
          { code: "ATTEMPT_TIMEOUT" },
        );
      },
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
   * device's containers at that moment. A failure other than the device being
   * unreachable also carries what Android says about its own state
   * (getAndroidState), while the device still answers.
   */
  private async withConnection<T>(
    operation: string,
    run: () => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();
    let attempts = 0;
    try {
      return await this.retryUntilReachable(async (progress) => {
        attempts++;
        await this.connectOnce(progress);
        return run();
      });
    } catch (error: unknown) {
      const [containers, android] = await Promise.all([
        this.deviceId ? getDeviceContainerStates(this.deviceId) : undefined,
        isTransientAdbError(error) ? undefined : getAndroidState(this.direct),
      ]);
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
          ...(android ? { android_state: android } : {}),
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
   * Connects once, unless already connected, then waits for Android to finish
   * booting, unless this client has already seen it booted. Throws "Device is
   * not connected", which retryUntilReachable waits out, while adbd isn't up
   * yet.
   *
   * Every client waits for the boot, not only the one that connects: adb's
   * server is shared, so the others find the device connected. They used to
   * go ahead at once, and the location route's `pm path` hung on an Android
   * still booting while setup waited out the boot (DOPPELGANGER-DT).
   */
  private async connectOnce(progress: AttemptProgress = {}): Promise<void> {
    if (!(await this.getIsConnected())) {
      await this.doConnect();
      if (!(await this.getIsConnected())) {
        throw new Error(`Device is not connected`);
      }
    }
    if (this.booted) return;

    const booting = new AbortController();
    progress.booting = booting;
    try {
      await this.waitForDevice({ signal: booting.signal });
      await this.waitBootComplete({ signal: booting.signal });
    } finally {
      if (progress.booting === booting) progress.booting = undefined;
    }
    this.booted = true;
  }

  /** Connects, waiting out a device that isn't reachable yet. */
  async connectRobust(): Promise<void> {
    await this.withConnection("connect", async () => {});
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
    return this.withConnection("getState", async () => {
      const maybeState = await this.direct.getState();
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
    return this.withConnection("install", () => this.direct.install(apk));
  }

  uninstall(packageName: string): Promise<boolean> {
    return this.withConnection("uninstall", () =>
      this.direct.uninstall(packageName),
    );
  }

  shell(command: string | ArrayLike<WithToString>): Promise<Duplex> {
    return this.withConnection("shell", () => this.direct.shell(command));
  }

  isInstalled(packageName: string): Promise<boolean> {
    return this.withConnection("isInstalled", () =>
      this.direct.isInstalled(packageName),
    );
  }

  getProperties(): Promise<Record<string, string>> {
    return this.withConnection("getProperties", () =>
      this.direct.getProperties(),
    );
  }

  getFeatures(): Promise<Features> {
    return this.withConnection("getFeatures", () => this.direct.getFeatures());
  }

  getDHCPIpAddress(iface?: string): Promise<string> {
    return this.withConnection("getDHCPIpAddress", () =>
      this.direct.getDHCPIpAddress(iface),
    );
  }

  forward(local: string, remote: string): Promise<boolean> {
    return this.withConnection("forward", () =>
      this.direct.forward(local, remote),
    );
  }

  listForwards(): Promise<Forward[]> {
    return this.withConnection("listForwards", () =>
      this.direct.listForwards(),
    );
  }

  reverse(remote: string, local: string): Promise<boolean> {
    return this.withConnection("reverse", () =>
      this.direct.reverse(remote, local),
    );
  }

  listReverses(): Promise<Reverse[]> {
    return this.withConnection("listReverses", () =>
      this.direct.listReverses(),
    );
  }

  reboot(): Promise<boolean> {
    return this.withConnection("reboot", () => this.direct.reboot());
  }

  remount(): Promise<boolean> {
    return this.withConnection("remount", () => this.direct.remount());
  }

  /**
   * Restarts adbd as root, resolving true once it's root, whether this
   * restarted it or it already was. adbd answers a root request that arrives
   * while it's restarting, as for another root request a moment before, with
   * nothing at all, which adbkit throws as an Error without a message; that's
   * waited out like any other device that can't be reached yet.
   */
  root(): Promise<boolean> {
    return this.withConnection("root", async () => {
      try {
        return await this.direct.root();
      } catch (error: unknown) {
        if (!(error instanceof Error)) throw error;
        if (error.message.includes("already running as root")) return true;
        if (error.message === "") throw new Error(ADBD_RESTARTING);
        throw error;
      }
    });
  }

  trackJdwp(): Promise<JdwpTracker> {
    return this.withConnection("trackJdwp", () => this.direct.trackJdwp());
  }

  framebuffer(format?: string): Promise<FramebufferStreamWithMeta> {
    return this.withConnection("framebuffer", () =>
      this.direct.framebuffer(format),
    );
  }

  screencap(): Promise<Duplex> {
    return this.withConnection("screencap", () => this.direct.screencap());
  }

  openLocal(path: string): Promise<Duplex> {
    return this.withConnection("openLocal", () => this.direct.openLocal(path));
  }

  openLog(name: string): Promise<Duplex> {
    return this.withConnection("openLog", () => this.direct.openLog(name));
  }

  openTcp(port: number): Promise<Duplex> {
    return this.withConnection("openTcp", () => this.direct.openTcp(port));
  }

  openMonkey(port?: number): Promise<MonkeyClient> {
    return this.withConnection("openMonkey", () =>
      this.direct.openMonkey(port),
    );
  }

  openLogcat(options?: { clear?: boolean }): Promise<Logcat> {
    return this.withConnection("openLogcat", () =>
      this.direct.openLogcat(options),
    );
  }

  openProcStat(): Promise<ProcStat> {
    return this.withConnection("openProcStat", () =>
      this.direct.openProcStat(),
    );
  }

  clear(packageName: string): Promise<boolean> {
    return this.withConnection("clear", () => this.direct.clear(packageName));
  }

  installRemote(packagePath: string): Promise<boolean> {
    return this.withConnection("installRemote", () =>
      this.direct.installRemote(packagePath),
    );
  }

  startActivity(options: StartActivityOptions): Promise<boolean> {
    return this.withConnection("startActivity", () =>
      this.direct.startActivity(options),
    );
  }

  startService(options: StartServiceOptions): Promise<boolean> {
    return this.withConnection("startService", () =>
      this.direct.startService(options),
    );
  }

  syncService(): Promise<Sync> {
    return this.withConnection("syncService", () => this.direct.syncService());
  }

  stat(path: string): Promise<Stats> {
    return this.withConnection("stat", () => this.direct.stat(path));
  }

  readdir(path: string): Promise<Entry[]> {
    return this.withConnection("readdir", () => this.direct.readdir(path));
  }

  pull(path: string): Promise<PullTransfer> {
    return this.withConnection("pull", () => this.direct.pull(path));
  }
}
