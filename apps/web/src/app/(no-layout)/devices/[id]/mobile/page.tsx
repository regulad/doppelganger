import { getDeviceForId } from "%/device-info/device-info.ts";
import CornerBackButton from "@/app/(no-layout)/devices/[id]/mobile/corner-back-button.tsx";
import ISpinner from "@/app/(no-layout)/devices/[id]/mobile/ispinner.tsx";
import DeviceClient from "@/components/client/device-client.tsx";
import { createClient } from "@/utils/supabase/server.ts";
import { notFound } from "next/navigation";
// import "./ios-client.css";
// there is never a reason to manually hide the cursor because the cursor will not show in the WKWebView;
// the cursor we view is from

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const deviceInfo = await getDeviceForId(id);

  if (!deviceInfo) {
    notFound();
  }

  const supabaseClient = await createClient();
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();

  // user will never be null here, but just put in the check for safety
  if (!user) {
    notFound();
  }
  if (!deviceInfo || deviceInfo.ownerId !== user.id) {
    notFound();
  }

  return (
    <>
      <div className="flex justify-center items-center place-items-center h-screen w-screen">
        <DeviceClient
          device={deviceInfo}
          loadingNode={<ISpinner large />}
          playAudio
          captureKeyboard
          autoRotate
        />
      </div>
      <CornerBackButton />
    </>
  );
}
