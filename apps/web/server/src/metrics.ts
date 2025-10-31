// Although it exports itself as a typed module, it's actually just CJS.
import io from "@pm2/io";

export const METRICrealtimeVncStreams = io.counter({
  name: "Open VNC Streams",
  id: "server/vnc",
});
