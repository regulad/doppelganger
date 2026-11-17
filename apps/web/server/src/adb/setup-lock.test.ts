import { LockStore, runDeviceSetupExclusively } from "./setup-lock.ts";

jest.mock("%/database/redis.ts", () => ({ getRedis: () => null }));

/** Stands in for Redis's SET NX and the release script, without expiry */
function fakeRedis() {
  const values = new Map<string, string>();
  const store: LockStore & { values: Map<string, string> } = {
    values,
    async set(key, value) {
      if (values.has(key)) return null;
      values.set(key, value);
      return "OK";
    },
    async eval(_script, _numKeys, key, token) {
      if (values.get(key) !== token) return 0;
      values.delete(key);
      return 1;
    },
  };
  return store;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

const fast = { pollIntervalMs: 5, ttlMs: 60_000 };

describe("one setup per device at a time", () => {
  it("makes a second setup of the device wait for the first to finish", async () => {
    const redis = fakeRedis();
    const order: string[] = [];
    const firstMayFinish = deferred();

    const first = runDeviceSetupExclusively(
      "dev1",
      async () => {
        order.push("first starts");
        await firstMayFinish.promise;
        order.push("first ends");
      },
      redis,
      fast,
    );
    const second = runDeviceSetupExclusively(
      "dev1",
      async () => {
        order.push("second starts");
      },
      redis,
      fast,
    );

    await new Promise((r) => setTimeout(r, 30));
    expect(order).toEqual(["first starts"]);

    firstMayFinish.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(["first starts", "first ends", "second starts"]);
    expect(redis.values.size).toBe(0);
  });

  it("lets different devices set up at the same time", async () => {
    const redis = fakeRedis();
    const firstMayFinish = deferred();
    let secondRan = false;

    const first = runDeviceSetupExclusively(
      "dev1",
      () => firstMayFinish.promise,
      redis,
      fast,
    );
    await runDeviceSetupExclusively(
      "dev2",
      async () => {
        secondRan = true;
      },
      redis,
      fast,
    );

    expect(secondRan).toBe(true);
    firstMayFinish.resolve();
    await first;
  });

  it("releases the device when a setup fails", async () => {
    const redis = fakeRedis();

    await expect(
      runDeviceSetupExclusively(
        "dev1",
        async () => {
          throw new Error("install failed");
        },
        redis,
        fast,
      ),
    ).rejects.toThrow("install failed");

    expect(redis.values.size).toBe(0);
  });

  it("doesn't release a lock that another setup has taken since", async () => {
    const redis = fakeRedis();

    await runDeviceSetupExclusively(
      "dev1",
      async () => {
        // as if this setup's lock had lapsed and another setup took it
        redis.values.set("device-setup-lock:dev1", "someone-else");
      },
      redis,
      fast,
    );

    expect(redis.values.get("device-setup-lock:dev1")).toBe("someone-else");
  });

  it("gives up once the lock should have lapsed", async () => {
    const redis = fakeRedis();
    redis.values.set("device-setup-lock:dev1", "stuck");
    const setUp = jest.fn();

    await expect(
      runDeviceSetupExclusively("dev1", setUp, redis, {
        pollIntervalMs: 5,
        ttlMs: 30,
      }),
    ).rejects.toThrow("Gave up waiting for another setup of device dev1");
    expect(setUp).not.toHaveBeenCalled();
  });

  it("runs setups of a device one at a time without Redis, too", async () => {
    const order: string[] = [];
    const firstMayFinish = deferred();

    const first = runDeviceSetupExclusively(
      "dev1",
      async () => {
        order.push("first starts");
        await firstMayFinish.promise;
        order.push("first ends");
      },
      null,
    );
    const second = runDeviceSetupExclusively(
      "dev1",
      async () => {
        order.push("second starts");
      },
      null,
    );

    await new Promise((r) => setTimeout(r, 10));
    firstMayFinish.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(["first starts", "first ends", "second starts"]);
  });
});
