// A device's containers: their names, and what Docker can say about them when
// something on the device fails. Kept apart from device-state.ts, which
// imports the ADB code, so the ADB client can use it without an import cycle.
import { spawn } from "node:child_process";

export function getRedroidContainerName(
  deviceId: string,
): `${string}-redroid-1` {
  return `${deviceId}-redroid-1`;
}

export function getScrcpyContainerName(deviceId: string): `${string}-scrcpy-1` {
  return `${deviceId}-scrcpy-1`;
}

interface DockerOutput {
  code: number | null;
  stdout: string;
  stderr: string;
}

// Runs the docker CLI and collects everything it prints, whatever its exit code
function runDocker(args: string[]): Promise<DockerOutput> {
  return new Promise((resolve, reject) => {
    const docker = spawn("docker", args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    docker.stdout.on("data", (data) => (stdout += data.toString()));
    docker.stderr.on("data", (data) => (stderr += data.toString()));
    docker.on("error", reject);
    docker.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

export interface ContainerState {
  status?: string;
  exitCode?: number;
  oomKilled?: boolean;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  health?: string;
  restartCount?: number;
  missing?: boolean;
  inspectError?: string;
}

async function getContainerState(name: string): Promise<ContainerState> {
  try {
    const { code, stdout, stderr } = await runDocker([
      "inspect",
      "--format",
      "{{json .State}}|{{.RestartCount}}",
      name,
    ]);
    if (code !== 0) {
      return { missing: true, inspectError: stderr.trim().slice(0, 500) };
    }
    const separator = stdout.lastIndexOf("|");
    const state = JSON.parse(stdout.slice(0, separator));
    return {
      status: state.Status,
      exitCode: state.ExitCode,
      oomKilled: state.OOMKilled,
      error: state.Error || undefined,
      startedAt: state.StartedAt,
      finishedAt: state.FinishedAt,
      health: state.Health?.Status,
      restartCount: Number(stdout.slice(separator + 1)),
    };
  } catch (e: unknown) {
    return { inspectError: String(e).slice(0, 500) };
  }
}

/**
 * What Docker says about each of a device's containers: whether they're
 * running, how the last one exited, and how often they've restarted. Only
 * their state, never their config, which holds the device's secret. Never
 * throws: a container Docker can't find is reported as missing.
 */
export async function getDeviceContainerStates(
  deviceId: string,
): Promise<Record<string, ContainerState>> {
  const names = [
    getRedroidContainerName(deviceId),
    getScrcpyContainerName(deviceId),
  ];
  const states = await Promise.all(names.map(getContainerState));
  return Object.fromEntries(names.map((name, i) => [name, states[i]]));
}

/**
 * The last lines a container logged, from both of its streams, interleaved by
 * Docker's timestamps.
 */
export async function getContainerLogTail(
  name: string,
  lines: number = 200,
): Promise<string> {
  const { code, stdout, stderr } = await runDocker([
    "logs",
    "--timestamps",
    "--tail",
    String(lines),
    name,
  ]);
  if (code !== 0) {
    throw new Error(`docker logs ${name} failed: ${stderr.trim()}`);
  }
  // Each line starts with an RFC 3339 timestamp, so they sort as text
  return [...stdout.split("\n"), ...stderr.split("\n")]
    .filter((line) => line.length)
    .sort()
    .join("\n");
}
