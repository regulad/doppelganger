import * as Sentry from "@sentry/node";
import { WebSocket } from "ws";

// The streams this pm2 worker proxies, reported to Sentry as a gauge per
// worker
let openStreams = 0;

function reportOpenStreams(): void {
  Sentry.metrics.gauge("streams.open", openStreams, {
    attributes: { "pm2.instance": process.env.NODE_APP_INSTANCE ?? "none" },
  });
}

/** Counts a proxied stream as open until its client's socket closes. */
export function trackOpenStream(ws: WebSocket): void {
  openStreams++;
  reportOpenStreams();
  ws.on("close", () => {
    openStreams--;
    reportOpenStreams();
  });
}
