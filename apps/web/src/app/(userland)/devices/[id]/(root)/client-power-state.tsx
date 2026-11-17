"use client";

import type { DevicePowerState } from "%/docker/device-state.ts";
import { Device } from "%/generated/prisma/browser.ts";
import { Button } from "@/components/ui/button.tsx";
import { useToast } from "@/components/ui/use-toast.ts";
import { clientSideReloadWithToast } from "@/utils/toast-utils.ts";
import * as Sentry from "@sentry/nextjs";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { LuLoaderCircle, LuPower, LuPowerOff } from "react-icons/lu";

// how often a booting device is checked on
const BOOT_POLL_MS = 3_000;

/**
 * While the device's Android boots, asks the server every few seconds whether
 * it has finished, and refreshes the page once it has (or the device stopped).
 */
function useRefreshWhenBooted(deviceId: string, booting: boolean): void {
  const router = useRouter();

  useEffect(() => {
    if (!booting) {
      return;
    }
    let stopped = false;
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/devices/${deviceId}/power`, {
          cache: "no-store",
        });
        const { state } = (await response.json()) as {
          state?: DevicePowerState;
        };
        if (!stopped && state && state !== "booting") {
          stopped = true;
          clearInterval(interval);
          router.refresh();
        }
      } catch {
        // a check that fails is retried on the next tick
      }
    }, BOOT_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [deviceId, booting, router]);
}

export function ClientDevicePowerStateButtons({
  deviceInfo,
  powerState,
}: Readonly<{
  deviceInfo: Device;
  powerState: DevicePowerState;
}>) {
  const deviceIsUp = powerState !== "off";
  const booting = powerState === "booting";
  useRefreshWhenBooted(deviceInfo.id, booting);
  const [deviceUpLoading, setDeviceUpLoading] = useState(false);
  const [deviceDownLoading, setDeviceDownLoading] = useState(false);
  const { toast } = useToast();

  const handleDeviceUp = useMemo(
    () => async (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
      e.preventDefault();
      setDeviceUpLoading(true);
      let response: Response;
      try {
        response = await fetch(`/api/devices/${deviceInfo.id}/start`, {
          method: "PUT",
        });
      } catch (e) {
        Sentry.captureException(e);
        console.error("Failed to start device", e);
        setDeviceUpLoading(false);
        toast({
          title: "Failed to start device",
          description: "Please try again later.",
        });
        return;
      }
      let responseJson: { error?: string };
      try {
        responseJson = await response.json();
      } catch (e) {
        Sentry.captureException(e);
        console.error("Failed to parse response", e);
        setDeviceUpLoading(false);
        toast({
          title: "Failed to start device",
          description: "Please try again later.",
        });
        return;
      }
      if (response.ok) {
        clientSideReloadWithToast({
          title: "Device started successfully",
        });
      } else {
        console.error("Failed to start device", response);
        setDeviceUpLoading(false);
        toast({
          title: "Failed to start device",
          description: responseJson.error ?? "Please try again later.",
        });
      }
    },
    [deviceInfo.id, toast],
  );

  const handleDeviceDown = useMemo(
    () => async (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
      e.preventDefault();
      setDeviceDownLoading(true);
      let response: Response;
      try {
        response = await fetch(`/api/devices/${deviceInfo.id}/stop`, {
          method: "PUT",
        });
      } catch (e) {
        Sentry.captureException(e);
        console.error("Failed to stop device", e);
        setDeviceUpLoading(false);
        toast({
          title: "Failed to stop device",
          description: "Please try again later.",
        });
        return;
      }
      let responseJson: { error?: string };
      try {
        responseJson = await response.json();
      } catch (e) {
        Sentry.captureException(e);
        console.error("Failed to parse response", e);
        setDeviceUpLoading(false);
        toast({
          title: "Failed to start device",
          description: "Please try again later.",
        });
        return;
      }
      if (response.ok) {
        clientSideReloadWithToast({
          title: "Device stopped successfully",
        });
      } else {
        console.error("Failed to stop device", response);
        setDeviceDownLoading(false);
        toast({
          title: "Failed to stop device",
          description: responseJson.error ?? "Please try again later.",
        });
      }
    },
    [deviceInfo.id, toast],
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <Button
          onClick={handleDeviceUp}
          variant="default"
          disabled={deviceUpLoading || deviceDownLoading || deviceIsUp}
        >
          <LuPower className="h-4 w-4" />
          <span className="ml-1">Start Device</span>
          {deviceUpLoading && (
            <LuLoaderCircle className="ml-2 h-4 w-4 animate-spin" />
          )}
        </Button>
        <Button
          onClick={handleDeviceDown}
          variant="destructive"
          disabled={deviceUpLoading || deviceDownLoading || !deviceIsUp}
        >
          <LuPowerOff className="h-4 w-4" />
          <span className="ml-1">Stop Device</span>
          {deviceDownLoading && (
            <LuLoaderCircle className="ml-2 h-4 w-4 animate-spin" />
          )}
        </Button>
      </div>
      {booting && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <LuLoaderCircle className="h-4 w-4 shrink-0 animate-spin" />
          Android is starting up. This usually takes about a minute, and this
          page updates once it&apos;s ready.
        </p>
      )}
    </div>
  );
}
