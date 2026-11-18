/**
 * Where setup notes, on the device itself, that it kept the image's own copy
 * of a package because an APK couldn't replace it, such as Chromium's WebView
 * over a redroid image's own, signed with another key. A note per package,
 * holding the APK's version code. /data survives the device's restarts.
 */
const KEPT_DIR = "/data/local/tmp/.doppelganger-kept-image-copies";

/** Runs a shell command on the device and returns what it printed */
export type DeviceShell = (command: string) => Promise<string>;

// Package names are Java-style identifiers, so they're safe in a shell path,
// but anything else is refused rather than quoted
function notePath(packageName: string): string {
  if (!/^[A-Za-z0-9_.]+$/.test(packageName)) {
    throw new Error(`Not a package name: ${packageName}`);
  }
  return `${KEPT_DIR}/${packageName}`;
}

/**
 * Whether setup already kept the image's own copy of this package for this
 * version of its APK, so pushing that APK again would fail the same way. A
 * newer APK, whose version code differs, gets tried again.
 */
export async function getKeptImageCopyFor(
  shell: DeviceShell,
  packageName: string,
  versionCode: number | bigint,
): Promise<boolean> {
  const noted = await shell(`cat ${notePath(packageName)} 2>/dev/null`);
  return noted.trim() === String(versionCode);
}

/** Notes that setup kept the image's own copy of this package for this APK */
export async function noteKeptImageCopy(
  shell: DeviceShell,
  packageName: string,
  versionCode: number | bigint,
): Promise<void> {
  await shell(
    `mkdir -p ${KEPT_DIR} && echo ${String(versionCode)} > ${notePath(packageName)}`,
  );
}
