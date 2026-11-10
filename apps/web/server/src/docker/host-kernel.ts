import { readFile } from "node:fs/promises";

/**
 * If the kernel that runs the redroid containers provides ashmem (ashmem_linux,
 * or ashmem built in), which images that don't boot on memfd need.
 *
 * /proc/misc is not namespaced, so from inside the web container it lists the
 * host's misc devices. This holds while the docker daemon is the host's own,
 * reached through the mounted socket; a remote DOCKER_HOST runs on a kernel
 * this can't see.
 */
export async function hostHasAshmem(): Promise<boolean> {
  let procMisc: string;
  try {
    procMisc = await readFile("/proc/misc", "utf-8");
  } catch {
    return false; // not Linux
  }
  // each line is "<minor> <name>", e.g. " 54 ashmem"
  return procMisc
    .split("\n")
    .some((line) => line.trim().split(/\s+/)[1] === "ashmem");
}
