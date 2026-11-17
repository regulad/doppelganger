"use client";

import type { Device } from "%/generated/prisma/browser.ts";
import pwaClickHandler from "@/app/(userland)/devices/pwa-click-handler.ts";
import DeviceClientWithButtons from "@/components/client/device-client-with-buttons.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LuLoaderCircle } from "react-icons/lu";

export default function DeviceConnectButtonClient(props: {
  device: Device;
  booting: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const router = useRouter();

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <div className="mb-6">
          <Button
            onClick={(e) => {
              const isPWA = pwaClickHandler(router, props.device, e);
              if (!isPWA) {
                setDialogOpen(true);
              }
            }}
            className="w-full"
            disabled={props.booting}
          >
            {props.booting ? (
              <>
                <LuLoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Android is starting…
              </>
            ) : (
              "Connect to Device"
            )}
          </Button>
        </div>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>{props.device.name}</DialogHeader>
        <VisuallyHidden.Root>
          <DialogDescription>
            Interactive stream for {props.device.name}
          </DialogDescription>
        </VisuallyHidden.Root>
        <DeviceClientWithButtons device={props.device} />
      </DialogContent>
    </Dialog>
  );
}
