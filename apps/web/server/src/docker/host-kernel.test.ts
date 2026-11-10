/**
 * @jest-environment node
 */

import { readFile } from "node:fs/promises";
import { hostHasAshmem } from "./host-kernel.ts";

jest.mock("node:fs/promises", () => ({ readFile: jest.fn() }));
const mockedReadFile = readFile as jest.MockedFunction<typeof readFile>;

describe("hostHasAshmem", () => {
  it("finds ashmem among the host's misc devices", async () => {
    mockedReadFile.mockResolvedValue(" 59 binder\n 54 ashmem\n232 kvm\n");
    expect(await hostHasAshmem()).toBe(true);
    expect(mockedReadFile).toHaveBeenCalledWith("/proc/misc", "utf-8");
  });

  it("is false when the host has no ashmem", async () => {
    mockedReadFile.mockResolvedValue("232 kvm\n229 fuse\n 60 ashmemx\n");
    expect(await hostHasAshmem()).toBe(false);
  });

  it("is false when /proc/misc can't be read", async () => {
    mockedReadFile.mockRejectedValue(new Error("ENOENT"));
    expect(await hostHasAshmem()).toBe(false);
  });
});
