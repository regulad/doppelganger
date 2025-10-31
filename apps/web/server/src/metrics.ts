import { counter } from "@pm2/io";

export const METRICrealtimeVncStreams = counter({
  name: "Open VNC Streams",
  id: "server/vnc",
});
