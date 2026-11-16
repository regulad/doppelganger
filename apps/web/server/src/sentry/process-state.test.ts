/**
 * @jest-environment node
 */

import { describeProcessState } from "./process-state";

describe("describeProcessState", () => {
  it("records a system error's identifying fields", () => {
    const epipe = Object.assign(new Error("write EPIPE"), {
      code: "EPIPE",
      errno: -32,
      syscall: "write",
    });
    expect(describeProcessState(epipe)).toMatchObject({
      error_code: "EPIPE",
      errno: -32,
      syscall: "write",
    });
  });

  it("counts the process's active handles by kind", () => {
    const timer = setTimeout(() => {}, 60_000);
    try {
      const state = describeProcessState(undefined);
      expect(
        (state.active_resources as Record<string, number>).Timeout,
      ).toBeGreaterThanOrEqual(1);
    } finally {
      clearTimeout(timer);
    }
  });

  it("describes stdout and stderr, and copes with a non-error", () => {
    const state = describeProcessState("not an error");
    expect(state.error_code).toBeUndefined();
    expect(state.stdout).toEqual({
      writable: expect.any(Boolean),
      destroyed: expect.any(Boolean),
      writableEnded: expect.any(Boolean),
    });
    expect(typeof state.uptime_s).toBe("number");
  });
});
