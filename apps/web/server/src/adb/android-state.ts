import { type DeviceClient } from "@devicefarmer/adbkit";
import { type Duplex } from "node:stream";

/** How long the whole snapshot may take, so a failure isn't held up for long */
export const ANDROID_STATE_TIMEOUT_MS = 5_000;

/**
 * The properties read, and only these: a device's others include its
 * Doppelganger secret (persist.doppelganger.secret).
 */
export const ANDROID_STATE_PROPERTIES = [
  // how far it got through booting
  "sys.boot_completed",
  "dev.bootcomplete",
  "sys.boot.reason",
  // how many times system_server has started, and when, in milliseconds
  // since the kernel booted (uptime_s is the same clock)
  "sys.system_server.start_count",
  "sys.system_server.start_elapsed",
  // the storage and install daemons an install goes through
  "init.svc.vold",
  "init.svc.installd",
  "sys.user.0.ce_available",
];

/** The system services an install goes through */
export const ANDROID_STATE_SERVICES = ["package", "mount"];

/**
 * The log tags of the parts of Android that start storage and the package
 * manager. Only these, from the main and system buffers: the user's own apps
 * log to the same buffers.
 */
export const ANDROID_STATE_LOG_TAGS = [
  "SystemServer",
  "SystemServiceManager",
  "StorageManagerService",
  "vold",
  "PackageManager",
];

/** How many of the last lines logged under each tag are kept */
const LOG_LINES_PER_TAG = 15;

// logcat's threadtime format:
// "11-21 02:33:08.320   647   647 I SystemServer: Entered the Android system server!"
const THREADTIME_TAG = /^\S+ \S+\s+\d+\s+\d+ [VDIWEFA] (.*?)\s*: /;

// a type, not an interface, so it fits SentryErrorContext's contexts
export type AndroidState = {
  properties?: Record<string, string>;
  uptime_s?: number;
  /** Whether each of ANDROID_STATE_SERVICES is registered */
  services?: Record<string, boolean>;
  /** The last lines logged under each of ANDROID_STATE_LOG_TAGS, in order */
  log?: string[];
  /** Each part that couldn't be read, and why */
  errors?: Record<string, string>;
};

/**
 * What Android itself says about its state, for a failure on a device that
 * answered: how far it got through booting, whether system_server has
 * restarted, whether the services an install needs are registered, and the
 * last lines logged by the parts of Android that start them. Never throws, and
 * gives up after ANDROID_STATE_TIMEOUT_MS with whatever it has read by then.
 */
export async function getAndroidState(
  client: DeviceClient,
  timeoutMs: number = ANDROID_STATE_TIMEOUT_MS,
): Promise<AndroidState> {
  const state: AndroidState = {};
  const errors: Record<string, string> = {};

  async function read<T>(
    part: string,
    get: () => Promise<T>,
    keep: (value: T) => void,
  ): Promise<void> {
    try {
      keep(await get());
    } catch (e: unknown) {
      errors[part] = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    }
  }

  const shell = (command: string) => client.shell(command).then(readOutput);

  const reads = Promise.all([
    read(
      "properties",
      () => client.getProperties(),
      (all) => {
        state.properties = Object.fromEntries(
          ANDROID_STATE_PROPERTIES.filter((name) => name in all).map((name) => [
            name,
            all[name],
          ]),
        );
      },
    ),
    read(
      "uptime_s",
      () => shell("cat /proc/uptime"),
      (output) => {
        state.uptime_s = Math.round(parseFloat(output));
      },
    ),
    read(
      "services",
      () =>
        shell(
          ANDROID_STATE_SERVICES.map((name) => `service check ${name}`).join(
            "; ",
          ),
        ),
      (output) => {
        // "Service mount: found", or "Service mount: not found"
        state.services = Object.fromEntries(
          [...output.matchAll(/^Service (\S+): (found|not found)$/gm)].map(
            ([, name, found]) => [name, found === "found"],
          ),
        );
      },
    ),
    read(
      "log",
      () =>
        shell(
          `logcat -d -b main -b system -v threadtime ${ANDROID_STATE_LOG_TAGS.map((tag) => `${tag}:V`).join(" ")} '*:S'`,
        ),
      (output) => {
        state.log = lastLinesPerTag(output, LOG_LINES_PER_TAG);
      },
    ),
  ]);

  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<true>((resolve) => {
    timer = setTimeout(() => resolve(true), timeoutMs);
  });
  if ((await Promise.race([reads, timedOut])) === true) {
    errors.snapshot = `gave up after ${timeoutMs / 1000} s`;
  }
  clearTimeout(timer);

  // a copy, so a read that finishes late doesn't change what was reported
  return structuredClone({
    ...state,
    ...(Object.keys(errors).length ? { errors } : {}),
  });
}

/**
 * The last lines logged under each tag, in the order they were logged: one
 * chatty tag would otherwise push the others out
 */
export function lastLinesPerTag(output: string, perTag: number): string[] {
  const lines = output.split("\n").filter((line) => THREADTIME_TAG.test(line));
  const left = new Map<string, number>();
  const kept: string[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const tag = lines[i].match(THREADTIME_TAG)![1];
    const remaining = left.get(tag) ?? perTag;
    if (remaining > 0) {
      kept.push(lines[i]);
      left.set(tag, remaining - 1);
    }
  }
  return kept.reverse();
}

async function readOutput(stream: Duplex): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString().trim();
}
