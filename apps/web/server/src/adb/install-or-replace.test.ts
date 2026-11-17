/**
 * @jest-environment node
 */

import { installOrReplace, isSignatureMismatch } from "./install-or-replace.ts";

// adbkit's InstallError: pm's reason, from "Failure [...]", is its code
function installError(code: string): Error {
  return Object.assign(new Error(`app.apk could not be installed [${code}]`), {
    code,
  });
}

const mismatch = installError(
  "INSTALL_FAILED_UPDATE_INCOMPATIBLE: Existing package com.android.webview signatures do not match newer version; ignoring!",
);

describe("isSignatureMismatch", () => {
  it("recognizes pm's signature mismatch", () => {
    expect(isSignatureMismatch(mismatch)).toBe(true);
    expect(
      isSignatureMismatch(installError("INSTALL_FAILED_UPDATE_INCOMPATIBLE")),
    ).toBe(true);
  });

  it("ignores other failures", () => {
    expect(
      isSignatureMismatch(installError("INSTALL_FAILED_INSUFFICIENT_STORAGE")),
    ).toBe(false);
    expect(isSignatureMismatch(new Error("Device is not connected"))).toBe(
      false,
    );
    expect(isSignatureMismatch(undefined)).toBe(false);
  });
});

describe("installOrReplace", () => {
  const notInImage = async () => false;

  it("installs over the copy on the device, keeping its data", async () => {
    const install = jest.fn().mockResolvedValue(true);
    const uninstall = jest.fn();

    await installOrReplace(install, uninstall, notInImage);

    expect(install).toHaveBeenCalledTimes(1);
    expect(uninstall).not.toHaveBeenCalled();
  });

  it("replaces a copy signed with another key", async () => {
    const calls: string[] = [];
    const install = jest
      .fn()
      .mockImplementationOnce(async () => {
        calls.push("install");
        throw mismatch;
      })
      .mockImplementationOnce(async () => {
        calls.push("install");
        return true;
      });
    const uninstall = jest.fn(async () => {
      calls.push("uninstall");
    });

    await installOrReplace(install, uninstall, notInImage);

    expect(calls).toEqual(["install", "uninstall", "install"]);
  });

  it("leaves the copy alone when the install fails for another reason", async () => {
    const failure = installError("INSTALL_FAILED_INSUFFICIENT_STORAGE");
    const install = jest.fn().mockRejectedValue(failure);
    const uninstall = jest.fn();

    await expect(installOrReplace(install, uninstall, notInImage)).rejects.toBe(
      failure,
    );
    expect(uninstall).not.toHaveBeenCalled();
  });

  it("fails when the replacement can't be installed either", async () => {
    const install = jest.fn().mockRejectedValue(mismatch);
    const uninstall = jest.fn();

    await expect(installOrReplace(install, uninstall, notInImage)).rejects.toBe(
      mismatch,
    );
    expect(uninstall).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledTimes(2);
  });

  it("keeps a copy built into the image, which uninstalling can't remove", async () => {
    const install = jest.fn().mockRejectedValue(mismatch);
    const uninstall = jest.fn();

    await expect(
      installOrReplace(install, uninstall, async () => true),
    ).resolves.toBe(false);
    expect(install).toHaveBeenCalledTimes(1);
    expect(uninstall).not.toHaveBeenCalled();
  });

  it("says when it installed the APK", async () => {
    const install = jest.fn().mockResolvedValue(true);

    await expect(
      installOrReplace(install, jest.fn(), notInImage),
    ).resolves.toBe(true);
  });
});
