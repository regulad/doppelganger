#!/usr/bin/env bash
# Downloads the third-party APKs that are installed on every device, checking
# each against a pinned SHA-256. A file that is already there and matches is
# kept, so running this again downloads nothing.
#
# usage: download-android-apps.sh [destination directory, default ./android]
set -euo pipefail

dest="${1:-./android}"
mkdir -p "$dest"

# prints a file's SHA-256, with GNU coreutils, BusyBox or macOS
sha256() {
  if command -v sha256sum > /dev/null; then
    sha256sum "$1"
  else
    shasum -a 256 "$1"
  fi | cut -d " " -f 1
}

# true when the file exists and has the expected SHA-256
verified() { # <file> <sha256>
  [ -f "$1" ] && [ "$(sha256 "$1")" = "$2" ]
}

# moves a downloaded file into place if its SHA-256 matches, and fails if not
place() { # <downloaded file> <destination> <sha256>
  local actual
  actual="$(sha256 "$1")"
  if [ "$actual" != "$3" ]; then
    echo "$2: expected SHA-256 $3, got $actual" >&2
    rm -f "$1"
    return 1
  fi
  mv -f "$1" "$2"
}

# F-Droid 1.17.0 (version code 1017050). f-droid.org moves old versions from
# its repo to its archive.
fdroid_sha256=dc3bb88f6419ee7dde7d1547a41569aa03282fe00e0dc43ce035efd7c9d27d75
if ! verified "$dest/F-Droid.apk" "$fdroid_sha256"; then
  echo "Downloading F-Droid 1.17.0..."
  curl -fsSL -o "$dest/F-Droid.apk.part" https://f-droid.org/repo/org.fdroid.fdroid_1017050.apk \
    || curl -fsSL -o "$dest/F-Droid.apk.part" https://f-droid.org/archive/org.fdroid.fdroid_1017050.apk
  place "$dest/F-Droid.apk.part" "$dest/F-Droid.apk" "$fdroid_sha256"
fi

# Chromium 158.0.8127.0 for arm64: ChromePublic and SystemWebView from the
# official snapshot build of Chromium commit 88c3ce43 (main@{#1727462}),
# built 2026-10-27. Both need Android 10 or later.
chromium_snapshot=1727462
chrome_public_sha256=2ce8c967bf8bc2c522a8b3eb4af395447b25df33aee37d4da38e1c61b739e9fa
system_webview_sha256=d730c5b885f7a6226fcc5d0312b06f3060bcd9cf263952910d8a025e8c80ae16
if ! verified "$dest/ChromePublic.apk" "$chrome_public_sha256" \
  || ! verified "$dest/SystemWebView.apk" "$system_webview_sha256"; then
  echo "Downloading Chromium snapshot $chromium_snapshot..."
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  curl -fsSL -o "$tmp/chrome-android.zip" \
    "https://commondatastorage.googleapis.com/chromium-browser-snapshots/Android_Arm64/$chromium_snapshot/chrome-android.zip"
  unzip -o -q "$tmp/chrome-android.zip" \
    chrome-android/apks/ChromePublic.apk chrome-android/apks/SystemWebView.apk -d "$tmp"
  place "$tmp/chrome-android/apks/ChromePublic.apk" "$dest/ChromePublic.apk" "$chrome_public_sha256"
  place "$tmp/chrome-android/apks/SystemWebView.apk" "$dest/SystemWebView.apk" "$system_webview_sha256"
fi

echo "The Android apps in $dest are in place."
