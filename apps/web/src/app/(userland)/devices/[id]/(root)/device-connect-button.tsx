"use server";

import { getDeviceForId } from "%/device-info/device-info.ts";
import { getDevicePowerState } from "%/docker/device-state.ts";
import DeviceConnectButtonClient from "@/app/(userland)/devices/[id]/(root)/device-connect-button-client.tsx";
import NotFound from "@/app/not-found.tsx";
import { createClient } from "@/utils/supabase/server.ts";

export default async function DeviceConnectButton({
  deviceId,
}: Readonly<{ deviceId: string }>) {
  // the layout never helped us
  const device = await getDeviceForId(deviceId);
  if (!device) {
    return <NotFound />;
  }
  const supabaseClient = await createClient();
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (!user || device.ownerId !== user.id) {
    return <NotFound />;
  }

  // no connecting until Android has booted; the power buttons refresh the
  // page once it has
  const booting = (await getDevicePowerState(device)) === "booting";

  return <DeviceConnectButtonClient device={device} booting={booting} />;
}
