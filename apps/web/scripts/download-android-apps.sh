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

echo "The Android apps in $dest are in place."
