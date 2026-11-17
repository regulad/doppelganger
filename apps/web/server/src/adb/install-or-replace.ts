/**
 * Whether an install failed because the copy already on the device is signed
 * with another key, which Android won't update in place. adbkit's install
 * error carries pm's reason as its code, such as
 * "INSTALL_FAILED_UPDATE_INCOMPATIBLE: Existing package com.android.webview
 * signatures do not match newer version; ignoring!".
 */
export function isSignatureMismatch(error: unknown): boolean {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return (
    typeof code === "string" &&
    code.startsWith("INSTALL_FAILED_UPDATE_INCOMPATIBLE")
  );
}

/**
 * Installs an APK over the copy already on the device, which keeps the app's
 * data, as Android allows whenever both are signed with the same key: each
 * Chromium snapshot is, for one. Only when Android refuses because the keys
 * differ does it replace the copy: `uninstall` removes it, losing its data, and
 * the APK is installed again.
 */
export async function installOrReplace(
  install: () => Promise<unknown>,
  uninstall: () => Promise<unknown>,
): Promise<void> {
  try {
    await install();
  } catch (error) {
    if (!isSignatureMismatch(error)) {
      throw error;
    }
    await uninstall();
    await install();
  }
}
