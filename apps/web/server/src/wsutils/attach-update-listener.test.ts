/**
 * @jest-environment node
 */

const updateMany = jest.fn();

jest.mock("%/database/prisma.ts", () => ({
  getPrisma: () => ({ device: { updateMany } }),
}));

import { WebSocket as WsWebSocket } from "ws";
import {
  refreshStreamingDevice,
  updateDeviceLastConnected,
} from "./attach-update-listener";

function openSocket() {
  return {
    OPEN: WsWebSocket.OPEN,
    readyState: WsWebSocket.OPEN,
    close: jest.fn(),
  } as unknown as WsWebSocket & { close: jest.Mock };
}

beforeEach(() => updateMany.mockReset());

describe("updateDeviceLastConnected", () => {
  it("records the time and says the device exists", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    await expect(updateDeviceLastConnected("dev1")).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "dev1" },
      data: { lastConnectedAt: expect.any(Date) },
    });
  });

  it("says a deleted device is gone instead of throwing", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    await expect(updateDeviceLastConnected("gone")).resolves.toBe(false);
  });
});

describe("refreshStreamingDevice", () => {
  it("leaves the stream open while the device exists", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    const ws = openSocket();
    const targetWs = openSocket();
    await refreshStreamingDevice(ws, targetWs, "dev1");
    expect(ws.close).not.toHaveBeenCalled();
    expect(targetWs.close).not.toHaveBeenCalled();
  });

  it("closes the stream once the device has been deleted", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const ws = openSocket();
    const targetWs = openSocket();
    await refreshStreamingDevice(ws, targetWs, "gone");
    expect(ws.close).toHaveBeenCalledWith(4404);
    expect(targetWs.close).toHaveBeenCalled();
  });
});
