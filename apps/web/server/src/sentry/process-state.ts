// What the process was holding when an exception went uncaught. Such an
// exception often has no stack to say where it came from: a socket's write
// EPIPE, for one, surfaces from Node's own WriteWrap callback.

interface StreamState {
  writable: boolean;
  destroyed: boolean;
  writableEnded: boolean;
}

function describeStream(stream: NodeJS.WriteStream): StreamState {
  return {
    writable: stream.writable,
    destroyed: stream.destroyed,
    writableEnded: stream.writableEnded,
  };
}

/**
 * The fields of a system error that say what failed (never its message's
 * free text), how long the process had run, how many of each kind of handle
 * it held (sockets, pipes, timers), and whether its stdout and stderr, pm2's
 * log pipes, could still be written to.
 */
export function describeProcessState(error: unknown): Record<string, unknown> {
  const activeResources: Record<string, number> = {};
  for (const resource of process.getActiveResourcesInfo?.() ?? []) {
    activeResources[resource] = (activeResources[resource] ?? 0) + 1;
  }

  const systemError = (
    error !== null && typeof error === "object" ? error : {}
  ) as Partial<NodeJS.ErrnoException & { address: string; port: number }>;

  return {
    error_code: systemError.code,
    errno: systemError.errno,
    syscall: systemError.syscall,
    address: systemError.address,
    port: systemError.port,
    uptime_s: Math.round(process.uptime()),
    active_resources: activeResources,
    stdout: describeStream(process.stdout),
    stderr: describeStream(process.stderr),
  };
}
