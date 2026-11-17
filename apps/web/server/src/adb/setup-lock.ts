import { getRedis } from "%/database/redis.ts";
import AsyncLock from "async-lock";
import { randomUUID } from "node:crypto";

/**
 * How long a setup may hold its device's lock. Longer than a setup takes:
 * each of its ADB operations waits at most five minutes for the device. Should
 * the process holding the lock die, the lock lapses after this long.
 */
export const SETUP_LOCK_TTL_MS = 20 * 60 * 1_000;

const POLL_INTERVAL_MS = 2_000;

/** The Redis commands the lock needs */
export interface LockStore {
  set(
    key: string,
    value: string,
    px: "PX",
    milliseconds: number,
    nx: "NX",
  ): Promise<"OK" | null>;
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
}

// Deletes the lock only while it still holds this setup's token, so a setup
// whose lock lapsed can't release the next setup's
const RELEASE_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

const inProcessLock = new AsyncLock({ maxPending: Infinity });

/**
 * Runs a device's setup once no other setup of that device is running, in
 * any of the server's processes. pm2 runs several workers, and any of them
 * can start a device: from its start button, or from Connect when its
 * containers aren't running. Two setups at once push the same APK to the same
 * temporary file on the device, and one install fails. A setup that finds
 * another running waits for it, then runs itself; installs it finds done
 * already are skipped.
 *
 * Without Redis, as in development, there's one process, so a lock in this
 * process does.
 */
export async function runDeviceSetupExclusively<T>(
  deviceId: string,
  setUp: () => Promise<T>,
  store: LockStore | null = getRedis(),
  { ttlMs = SETUP_LOCK_TTL_MS, pollIntervalMs = POLL_INTERVAL_MS } = {},
): Promise<T> {
  if (!store) {
    return inProcessLock.acquire(deviceId, setUp);
  }

  const key = `device-setup-lock:${deviceId}`;
  const token = randomUUID();
  // The lock lapses within ttlMs of being taken, so a setup that waits longer
  // finds it retaken by yet another setup
  const giveUpAt = Date.now() + ttlMs;
  while ((await store.set(key, token, "PX", ttlMs, "NX")) !== "OK") {
    if (Date.now() >= giveUpAt) {
      throw new Error(
        `Gave up waiting for another setup of device ${deviceId} to finish`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  try {
    return await setUp();
  } finally {
    // If this fails, the lock lapses on its own
    await store.eval(RELEASE_SCRIPT, 1, key, token).catch(() => undefined);
  }
}
