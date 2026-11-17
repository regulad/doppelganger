import { getDeviceForId } from "%/device-info/device-info.ts";
import {
  type DevicePowerState,
  getDevicePowerState,
} from "%/docker/device-state.ts";
import { deviceApiEndpoint } from "%/endpoint-regex.ts";
import { createClient } from "@/utils/supabase/server.ts";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Whether the device is off, booting or on, for the device page to follow
 * while Android starts.
 */
export async function GET(
  req: NextRequest,
): Promise<NextResponse<{ state?: DevicePowerState }>> {
  const supabaseClient = await createClient();
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();

  if (!user) {
    return NextResponse.json({}, { status: 401 });
  }

  const id = req.nextUrl.pathname.match(deviceApiEndpoint)![1];
  const device = await getDeviceForId(id);

  // don't 403, so as not to say whether the device exists
  if (!device || device.ownerId !== user.id) {
    return NextResponse.json({}, { status: 404 });
  }

  return NextResponse.json(
    { state: await getDevicePowerState(device) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
