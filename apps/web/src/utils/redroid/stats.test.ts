import {
  CPU_LIMIT_CPUS,
  MEMORY_LIMIT_BYTES,
  VOLUME_SIZE_LIMIT_BYTES,
} from "%/constants.ts";
import { getIsDeviceRunning } from "%/docker/device-state.ts";
import { Device } from "%/generated/prisma/client.ts";
import {
  getConnectionStatus,
  getCpuUsage,
  getMemoryUsedBytes,
  getRunningStatus,
  getStorageUsedBytes,
} from "@/utils/redroid/stats";

jest.mock("%/docker/device-paths.ts", () => ({
  getDataDirOfDevice: jest.fn().mockReturnValue("/data/device"),
}));

jest.mock("%/docker/device-state.ts", () => ({
  getIsDeviceRunning: jest.fn(),
  getRedroidContainerName: jest.fn().mockReturnValue("redroid_container"),
}));

jest.mock("%/adb/adb-device.ts", () => ({
  AdbDevice: jest.fn().mockImplementation(() => ({
    getIsConnected: jest.fn(),
  })),
}));

jest.mock("@/utils/docker/resource-utils.ts", () => ({
  getCpuUsageOfDockerContainerCpus: jest.fn(),
  getMemoryUsageOfDockerContainerBytes: jest.fn(),
  getTotalDiskUsageOfDirectoryBytes: jest.fn(),
  isNoSuchContainerError: jest.requireActual("@/utils/docker/resource-utils.ts")
    .isNoSuchContainerError,
}));

const captureException = jest.fn();
jest.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

const noSuchContainer = new Error(
  'Command failed: docker stats --no-stream --format "{{.MemUsage}}" redroid_container\n' +
    "Error response from daemon: No such container: redroid_container\n",
);

describe("Device Stats Functions", () => {
  const mockDevice: Device = {
    id: "device1",
    name: "Test Device",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Device;

  describe("getRunningStatus", () => {
    it("should return true when device is running", async () => {
      (getIsDeviceRunning as unknown as jest.Mock).mockResolvedValue(true);
      await expect(getRunningStatus(mockDevice)).resolves.toBe(true);
    });

    it("should return false when device is not running", async () => {
      (getIsDeviceRunning as unknown as jest.Mock).mockResolvedValue(false);
      await expect(getRunningStatus(mockDevice)).resolves.toBe(false);
    });
  });

  describe("getConnectionStatus", () => {
    it("should return true when device is connected", async () => {
      require("%/adb/adb-device.ts").AdbDevice.mockImplementation(() => ({
        getIsConnected: jest.fn().mockResolvedValue(true),
      }));
      await expect(getConnectionStatus(mockDevice)).resolves.toBe(true);
    });

    it("should return false when device is not connected", async () => {
      require("%/adb/adb-device.ts").AdbDevice.mockImplementation(() => ({
        getIsConnected: jest.fn().mockResolvedValue(false),
      }));
      await expect(getConnectionStatus(mockDevice)).resolves.toBe(false);
    });
  });

  describe("getStorageUsedBytes", () => {
    it("should return used and total storage bytes", async () => {
      require("@/utils/docker/resource-utils.ts").getTotalDiskUsageOfDirectoryBytes.mockResolvedValue(
        5000,
      );
      await expect(getStorageUsedBytes(mockDevice)).resolves.toEqual([
        5000,
        VOLUME_SIZE_LIMIT_BYTES,
      ]);
    });
  });

  describe("getMemoryUsedBytes", () => {
    it("should return used and total memory bytes", async () => {
      require("@/utils/docker/resource-utils.ts").getMemoryUsageOfDockerContainerBytes.mockResolvedValue(
        2000,
      );
      await expect(getMemoryUsedBytes(mockDevice)).resolves.toEqual([
        2000,
        MEMORY_LIMIT_BYTES,
      ]);
    });

    it("has no usage to show, and nothing to report, while the container doesn't exist", async () => {
      captureException.mockClear();
      require("@/utils/docker/resource-utils.ts").getMemoryUsageOfDockerContainerBytes.mockRejectedValue(
        noSuchContainer,
      );
      await expect(getMemoryUsedBytes(mockDevice)).resolves.toEqual([
        -1,
        MEMORY_LIMIT_BYTES,
      ]);
      expect(captureException).not.toHaveBeenCalled();
    });

    it("reports any other failure to read the usage", async () => {
      captureException.mockClear();
      const daemonDown = new Error("Cannot connect to the Docker daemon");
      require("@/utils/docker/resource-utils.ts").getMemoryUsageOfDockerContainerBytes.mockRejectedValue(
        daemonDown,
      );
      await expect(getMemoryUsedBytes(mockDevice)).resolves.toEqual([
        -1,
        MEMORY_LIMIT_BYTES,
      ]);
      expect(captureException).toHaveBeenCalledWith(daemonDown);
    });
  });

  describe("getCpuUsage", () => {
    it("should return used CPUs and total CPUs", async () => {
      require("@/utils/docker/resource-utils.ts").getCpuUsageOfDockerContainerCpus.mockResolvedValue(
        2,
      );
      await expect(getCpuUsage(mockDevice)).resolves.toEqual([
        2,
        CPU_LIMIT_CPUS,
      ]);
    });

    it("has no usage to show, and nothing to report, while the container doesn't exist", async () => {
      captureException.mockClear();
      require("@/utils/docker/resource-utils.ts").getCpuUsageOfDockerContainerCpus.mockRejectedValue(
        noSuchContainer,
      );
      await expect(getCpuUsage(mockDevice)).resolves.toEqual([
        -1,
        CPU_LIMIT_CPUS,
      ]);
      expect(captureException).not.toHaveBeenCalled();
    });
  });
});
