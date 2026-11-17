import * as childProcess from "child_process";
import {
  getCpuUsageOfDockerContainerCpus,
  getMemoryUsageOfDockerContainerBytes,
  getTotalDiskUsageOfDirectoryBytes,
  isNoSuchContainerError,
} from "./resource-utils";

jest.mock("child_process", () => ({
  exec: jest.fn(),
}));

describe("Docker Resource Utils", () => {
  describe("getTotalDiskUsageOfDirectoryBytes", () => {
    it("returns total disk usage in bytes for valid directory", async () => {
      (childProcess.exec as unknown as jest.Mock).mockImplementationOnce(
        (cmd, callback) => {
          callback(null, { stdout: "1024\t/some/path" });
        },
      );
      const size = await getTotalDiskUsageOfDirectoryBytes("/some/path");
      expect(size).toEqual(1024);
    });

    it("throws error on exec failure", async () => {
      (childProcess.exec as unknown as jest.Mock).mockImplementationOnce(
        (cmd, callback) => {
          callback(new Error("Failed to execute command"), null);
        },
      );
      await expect(
        getTotalDiskUsageOfDirectoryBytes("/invalid/path"),
      ).rejects.toThrow("Failed to execute command");
    });
  });

  describe("getMemoryUsageOfDockerContainerBytes", () => {
    it("returns memory usage in bytes for valid container ID", async () => {
      (childProcess.exec as unknown as jest.Mock).mockImplementationOnce(
        (cmd, callback) => {
          callback(null, { stdout: "163.9MiB / 23.42GiB" });
        },
      );
      const usage = await getMemoryUsageOfDockerContainerBytes("container123");
      expect(usage).toBeCloseTo(163.9 * 1024 * 1024);
    });

    it("throws error on exec failure", async () => {
      (childProcess.exec as unknown as jest.Mock).mockImplementationOnce(
        (cmd, callback) => {
          callback(new Error("Failed to execute command"), null);
        },
      );
      await expect(
        getMemoryUsageOfDockerContainerBytes("invalidContainer"),
      ).rejects.toThrow("Failed to execute command");
    });
  });

  describe("getCpuUsageOfDockerContainerCpus", () => {
    it("returns CPU usage as a fraction of a CPU for valid container ID", async () => {
      (childProcess.exec as unknown as jest.Mock).mockImplementationOnce(
        (cmd, callback) => {
          callback(null, { stdout: "25.00%" });
        },
      );
      const usage = await getCpuUsageOfDockerContainerCpus("container123");
      expect(usage).toEqual(0.25);
    });

    it("throws error on exec failure", async () => {
      (childProcess.exec as unknown as jest.Mock).mockImplementationOnce(
        (cmd, callback) => {
          callback(new Error("Failed to execute command"), null);
        },
      );
      await expect(
        getCpuUsageOfDockerContainerCpus("invalidContainer"),
      ).rejects.toThrow("Failed to execute command");
    });
  });

  describe("isNoSuchContainerError", () => {
    it("recognizes docker's answer for a container that doesn't exist", () => {
      const error = new Error(
        'Command failed: docker stats --no-stream --format "{{.CPUPerc}}" abc-redroid-1\n' +
          "Error response from daemon: No such container: abc-redroid-1\n",
      );
      expect(isNoSuchContainerError(error)).toBe(true);
    });

    it("doesn't mistake other failures for a missing container", () => {
      expect(
        isNoSuchContainerError(
          new Error(
            "Cannot connect to the Docker daemon at unix:///var/run/docker.sock",
          ),
        ),
      ).toBe(false);
      expect(isNoSuchContainerError("No such container")).toBe(false);
    });
  });
});
