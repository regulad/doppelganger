/**
 * @jest-environment node
 */

import { EventEmitter } from "node:events";

// A fake docker CLI: each call answers from the script for its arguments
const answers = new Map<
  string,
  { code: number; stdout: string; stderr: string }
>();

jest.mock("node:child_process", () => ({
  spawn: jest.fn((_command: string, args: string[]) => {
    const answer = answers.get(args.join(" ")) ?? {
      code: 1,
      stdout: "",
      stderr: "no answer scripted",
    };
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    });
    setImmediate(() => {
      if (answer.stdout) child.stdout.emit("data", Buffer.from(answer.stdout));
      if (answer.stderr) child.stderr.emit("data", Buffer.from(answer.stderr));
      child.emit("close", answer.code);
    });
    return child;
  }),
}));

import { getContainerLogTail, getDeviceContainerStates } from "./containers";

const inspect = (name: string) =>
  `inspect --format {{json .State}}|{{.RestartCount}} ${name}`;

beforeEach(() => answers.clear());

describe("getDeviceContainerStates", () => {
  it("reports each container's state, and a missing one as missing", async () => {
    answers.set(inspect("dev1-redroid-1"), {
      code: 0,
      stdout:
        JSON.stringify({
          Status: "exited",
          ExitCode: 137,
          OOMKilled: true,
          Error: "",
          StartedAt: "2026-11-16T05:19:00Z",
          FinishedAt: "2026-11-16T05:20:00Z",
        }) + "|4\n",
      stderr: "",
    });
    answers.set(inspect("dev1-scrcpy-1"), {
      code: 1,
      stdout: "",
      stderr: "Error: No such object: dev1-scrcpy-1\n",
    });

    expect(await getDeviceContainerStates("dev1")).toEqual({
      "dev1-redroid-1": {
        status: "exited",
        exitCode: 137,
        oomKilled: true,
        error: undefined,
        startedAt: "2026-11-16T05:19:00Z",
        finishedAt: "2026-11-16T05:20:00Z",
        health: undefined,
        restartCount: 4,
      },
      "dev1-scrcpy-1": {
        missing: true,
        inspectError: "Error: No such object: dev1-scrcpy-1",
      },
    });
  });
});

describe("getContainerLogTail", () => {
  it("interleaves both streams by timestamp", async () => {
    answers.set("logs --timestamps --tail 200 dev1-redroid-1", {
      code: 0,
      stdout: "2026-11-16T05:19:01Z init: a\n2026-11-16T05:19:03Z init: c\n",
      stderr: "2026-11-16T05:19:02Z binder: b\n",
    });
    expect(await getContainerLogTail("dev1-redroid-1")).toBe(
      [
        "2026-11-16T05:19:01Z init: a",
        "2026-11-16T05:19:02Z binder: b",
        "2026-11-16T05:19:03Z init: c",
      ].join("\n"),
    );
  });

  it("throws when docker can't read the logs", async () => {
    answers.set("logs --timestamps --tail 200 gone", {
      code: 1,
      stdout: "",
      stderr: "Error: No such container: gone\n",
    });
    await expect(getContainerLogTail("gone")).rejects.toThrow(
      "No such container",
    );
  });
});
