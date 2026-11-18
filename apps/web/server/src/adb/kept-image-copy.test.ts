/**
 * @jest-environment node
 */

import { getKeptImageCopyFor, noteKeptImageCopy } from "./kept-image-copy.ts";

/** A device's shell, holding files written with echo and read with cat */
function fakeShell() {
  const files = new Map<string, string>();
  const commands: string[] = [];
  const shell = async (command: string): Promise<string> => {
    commands.push(command);
    const write = command.match(/echo (\S+) > (\S+)$/);
    if (write) {
      files.set(write[2], `${write[1]}\n`);
      return "";
    }
    const read = command.match(/^cat (\S+)/);
    return read ? (files.get(read[1]) ?? "") : "";
  };
  return { shell, commands };
}

describe("kept image copies", () => {
  it("remembers the APK version it kept the image's copy for", async () => {
    const { shell } = fakeShell();
    await noteKeptImageCopy(shell, "com.android.webview", 815803233);

    expect(
      await getKeptImageCopyFor(shell, "com.android.webview", 815803233),
    ).toBe(true);
  });

  it("tries a newer APK again", async () => {
    const { shell } = fakeShell();
    await noteKeptImageCopy(shell, "com.android.webview", 815803233);

    expect(
      await getKeptImageCopyFor(
        shell,
        "com.android.webview",
        BigInt(815803299),
      ),
    ).toBe(false);
  });

  it("has nothing noted for a package it never kept", async () => {
    const { shell } = fakeShell();
    expect(
      await getKeptImageCopyFor(shell, "com.android.webview", 815803233),
    ).toBe(false);
  });

  it("refuses anything but a package name in the shell command", async () => {
    const { shell, commands } = fakeShell();
    await expect(
      noteKeptImageCopy(shell, "x; rm -rf /data", 1),
    ).rejects.toThrow("Not a package name");
    expect(commands).toEqual([]);
  });
});
