/**
 * @jest-environment node
 */

import { type DeviceClient } from "@devicefarmer/adbkit";
import { Readable } from "node:stream";
import { getAndroidState, lastLinesPerTag } from "./android-state.ts";

// what Android 14 printed for each, on an emulator
const PROPERTIES = {
  "sys.boot_completed": "1",
  "dev.bootcomplete": "1",
  "sys.boot.reason": "reboot",
  "sys.system_server.start_count": "1",
  "sys.system_server.start_elapsed": "10944",
  "init.svc.vold": "running",
  "init.svc.installd": "running",
  "sys.user.0.ce_available": "true",
  "persist.doppelganger.secret": "the device's secret",
  "ro.product.model": "redroid14_arm64",
};
const LOG = [
  "--------- beginning of system",
  "11-21 02:33:08.320   647   647 I SystemServer: Entered the Android system server!",
  "11-21 02:33:09.679   647   750 W StorageManagerService: No primary storage defined yet; hacking together a stub",
  "11-21 02:33:27.164   243   243 I vold    : Writing 40 to /sys/class/bdi/0:82/max_ratio",
].join("\n");

function deviceAnswering(
  answers: Partial<
    Record<"properties" | "uptime" | "services" | "log", () => Promise<unknown>>
  >,
): DeviceClient {
  const output = (text: string) => Readable.from([Buffer.from(text)]);
  return {
    getProperties: answers.properties ?? (async () => PROPERTIES),
    shell: async (command: string) => {
      if (command === "cat /proc/uptime") {
        return (answers.uptime ?? (async () => output("63.86 162.22\n")))();
      }
      if (command.startsWith("service check")) {
        return (
          answers.services ??
          (async () =>
            output("Service package: found\nService mount: not found\n"))
        )();
      }
      if (command.startsWith("logcat")) {
        return (answers.log ?? (async () => output(LOG)))();
      }
      throw new Error(`unexpected command: ${command}`);
    },
  } as unknown as DeviceClient;
}

describe("getAndroidState", () => {
  it("says how far Android got, and what it logged", async () => {
    const state = await getAndroidState(deviceAnswering({}));

    expect(state).toEqual({
      properties: {
        "sys.boot_completed": "1",
        "dev.bootcomplete": "1",
        "sys.boot.reason": "reboot",
        "sys.system_server.start_count": "1",
        "sys.system_server.start_elapsed": "10944",
        "init.svc.vold": "running",
        "init.svc.installd": "running",
        "sys.user.0.ce_available": "true",
      },
      uptime_s: 64,
      services: { package: true, mount: false },
      log: LOG.split("\n").slice(1),
    });
  });

  it("never reads the device's other properties, its secret among them", async () => {
    const state = await getAndroidState(deviceAnswering({}));

    expect(JSON.stringify(state)).not.toContain("the device's secret");
    expect(state.properties).not.toHaveProperty("ro.product.model");
  });

  it("says which parts it couldn't read, and why", async () => {
    const state = await getAndroidState(
      deviceAnswering({
        log: async () => {
          throw new Error("Failure: 'device offline'");
        },
      }),
    );

    expect(state.errors).toEqual({ log: "Failure: 'device offline'" });
    expect(state.services).toEqual({ package: true, mount: false });
  });

  it("gives up on a device that stops answering, with what it has", async () => {
    const state = await getAndroidState(
      deviceAnswering({ log: () => new Promise(() => {}) }),
      100,
    );

    expect(state.errors).toEqual({ snapshot: "gave up after 0.1 s" });
    expect(state.log).toBeUndefined();
    expect(state.properties?.["sys.boot_completed"]).toBe("1");
  });
});

describe("lastLinesPerTag", () => {
  it("keeps the last lines of each tag, in the order they were logged", () => {
    const output = [
      "11-21 02:33:01.000     1     1 I PackageManager: one",
      "11-21 02:33:02.000     1     1 I vold    : first",
      "11-21 02:33:03.000     1     1 I PackageManager: two",
      "11-21 02:33:04.000     1     1 I PackageManager: three: with a colon",
      "11-21 02:33:05.000     1     1 I vold    : second",
    ].join("\n");

    expect(lastLinesPerTag(output, 2)).toEqual([
      "11-21 02:33:02.000     1     1 I vold    : first",
      "11-21 02:33:03.000     1     1 I PackageManager: two",
      "11-21 02:33:04.000     1     1 I PackageManager: three: with a colon",
      "11-21 02:33:05.000     1     1 I vold    : second",
    ]);
  });
});
