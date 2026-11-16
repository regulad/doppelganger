import { sleep } from "./promise-utils";

describe("promise-utils", () => {
  describe("sleep", () => {
    // Fake timers, so the tests don't depend on the real clock: a real
    // 100 ms timer measured with Date.now() can come out at 99 ms
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    async function settledAfter(ms: number, waitMs: number): Promise<boolean> {
      let settled = false;
      sleep(ms).then(() => {
        settled = true;
      });
      await jest.advanceTimersByTimeAsync(waitMs);
      return settled;
    }

    it("doesn't resolve before the specified time", async () => {
      expect(await settledAfter(100, 99)).toBe(false);
    });

    it("resolves after the specified time", async () => {
      expect(await settledAfter(100, 100)).toBe(true);
    });

    it("resolves at once for zero milliseconds", async () => {
      expect(await settledAfter(0, 0)).toBe(true);
    });

    it("handles large sleep durations", async () => {
      expect(await settledAfter(2000, 1999)).toBe(false);
      expect(await settledAfter(2000, 2000)).toBe(true);
    });
  });
});
