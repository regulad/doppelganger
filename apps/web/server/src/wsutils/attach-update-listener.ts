import { getPrisma } from "%/database/prisma.ts";
import * as Sentry from "@sentry/node";
import { WebSocket as WsWebSocket } from "ws";

const UPDATE_DB_INTERVAL = 60_000; // 60s

/**
 * Records that the device is being streamed. Returns false, rather than
 * throwing, when the device no longer exists: it can be deleted while a
 * client still streams it, and production's cached lookups can still return
 * it for a moment after.
 */
export async function updateDeviceLastConnected(
  deviceId: string,
): Promise<boolean> {
  const prisma = getPrisma();

  const { count } = await prisma.device.updateMany({
    where: {
      id: deviceId,
    },
    data: {
      lastConnectedAt: new Date(),
    },
  });
  return count > 0;
}

export async function refreshStreamingDevice(
  ws: WsWebSocket,
  targetWs: WsWebSocket,
  deviceId: string,
): Promise<void> {
  if (ws.readyState !== ws.OPEN || targetWs.readyState !== targetWs.OPEN) {
    return;
  }

  if (!(await updateDeviceLastConnected(deviceId))) {
    // the device was deleted while it streamed
    ws.close(4404); // app: equiv to http 404
    targetWs.close();
  }
}

export function attachUpdateListener(
  ws: WsWebSocket,
  targetWs: WsWebSocket,
  deviceId: string,
): void {
  // now that the proxy is established and piping in the background, we can write to the db that the device is streaming
  // only write this for video streaming (scrcpy & kasmvnc)

  // setInterval runs it repeatedly
  const refreshInterval = setInterval(() => {
    refreshStreamingDevice(ws, targetWs, deviceId).catch((e: unknown) => {
      console.error("error refreshing a streaming device", e);
      Sentry.captureException(e);
    });
  }, UPDATE_DB_INTERVAL);
  ws.on("close", () => {
    clearInterval(refreshInterval);
  });
}
