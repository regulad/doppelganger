// Writes the /licenses page's list: each package the web app ships in
// production, and each work copied into it, with its license. With a second
// path, it also writes the notices those licenses ask to go with the code:
// each one's copyright lines and license text, which the site serves (much of
// this code reaches every visitor's browser, minified, without its notices).
//
// pnpm list gives the production dependency tree from what's installed, and
// each package's own package.json and license files give its license. Neither
// needs pnpm's store, which the image's build step doesn't have (pnpm licenses
// list does need it). license-checker, which this replaces, walks
// node_modules, and under pnpm it saw only about a tenth of the packages.
//
// Usage: node scripts/generate-licenses.mjs <output.json> [<notices.txt>]
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const [output, noticesOutput] = process.argv.slice(2);
if (!output) {
  throw new Error("usage: generate-licenses.mjs <output.json> [<notices.txt>]");
}

// Apache License 2.0's text, as scrcpy's server is shipped with it
const APACHE_2_0 = "scrcpy/LICENSE";

/**
 * The works copied into apps/web rather than installed from npm. NOTICE, at
 * the repository's root, says where each came from. Paths are relative to
 * apps/web.
 * @type {Array<{name: string, version?: string, license: string, about: string, files: string[]}>}
 */
const INCLUDED = [
  {
    name: "ws-scrcpy",
    version: "9d12bdd",
    license: "MIT",
    about: "The device page's client, in src/ws-scrcpy/src/.",
    files: ["src/ws-scrcpy/LICENSE"],
  },
  {
    name: "Broadway",
    license: "BSD-3-Clause",
    about: "An H.264 decoder, in src/ws-scrcpy/vendor/Broadway/.",
    files: [
      "src/ws-scrcpy/vendor/Broadway/LICENSE",
      "src/ws-scrcpy/vendor/Broadway/AUTHORS",
    ],
  },
  {
    name: "h264-live-player",
    version: "6966af8",
    license: "BSD-3-Clause",
    about: "A WebGL H.264 player, in src/ws-scrcpy/vendor/h264-live-player/.",
    files: [
      "src/ws-scrcpy/vendor/h264-live-player/LICENSE",
      "src/ws-scrcpy/vendor/h264-live-player/AUTHORS",
    ],
  },
  {
    name: "tinyh264",
    version: "caf7142",
    license: "ISC",
    about: "An H.264 decoder, in src/ws-scrcpy/vendor/tinyh264/.",
    files: ["src/ws-scrcpy/vendor/tinyh264/LICENSE"],
  },
  {
    name: "Material Design icons",
    license: "Apache-2.0",
    about:
      "By Google, from https://github.com/google/material-design-icons, in src/ws-scrcpy/src/public/images/buttons/.",
    files: [APACHE_2_0],
  },
  {
    name: "Android emulator skin images",
    license: "Apache-2.0",
    about:
      "Copyright (C) The Android Open Source Project, from the Android emulator, in src/ws-scrcpy/src/public/images/skin-light/ and src/ws-scrcpy/src/public/images/multitouch/.",
    files: [APACHE_2_0],
  },
  {
    name: "Closure Library",
    license: "Apache-2.0",
    about:
      "Copyright 2008 The Closure Library Authors. One function, in src/ws-scrcpy/src/app/Util.ts.",
    files: [APACHE_2_0],
  },
  {
    name: "shadcn/ui",
    license: "MIT",
    about: "Components, some modified, in src/components/ui/.",
    files: ["src/components/ui/LICENSE.md"],
  },
  {
    name: "scrcpy server",
    version: "1.19-ws5",
    license: "Apache-2.0",
    about:
      "Copyright (C) 2018 Genymobile; Copyright (C) 2018-2021 Romain Vimont. scrcpy/scrcpy-server.jar, built from https://github.com/regulad/scrcpy at 02173c8, run on the devices.",
    files: [APACHE_2_0],
  },
];

/** @typedef {{version?: string, path?: string, dependencies?: Record<string, Dependency>}} Dependency */

/** @type {Array<{dependencies?: Record<string, Dependency>}>} */
const projects = JSON.parse(
  execFileSync("pnpm", ["list", "--prod", "--depth", "Infinity", "--json"], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  }),
);

/**
 * A package's license as its package.json states it: an SPDX expression, or
 * the older { type } object or licenses array. Null when the package isn't
 * installed, as for an optional package built for another platform, such as
 * one of esbuild's, which pnpm list still names.
 * @param {string} packageDir
 * @returns {string | null}
 */
function readLicense(packageDir) {
  let manifest;
  try {
    manifest = JSON.parse(
      readFileSync(path.join(packageDir, "package.json"), "utf8"),
    );
  } catch {
    return null;
  }
  const { license, licenses } = manifest;
  if (typeof license === "string" && license) return license;
  if (license && typeof license.type === "string") return license.type;
  if (Array.isArray(licenses) && licenses.length) {
    return licenses
      .map((entry) => (typeof entry === "string" ? entry : entry?.type))
      .filter(Boolean)
      .join(" OR ");
  }
  return "Unknown";
}

/**
 * A package's license files: LICENSE, LICENCE, COPYING and NOTICE, with any
 * extension, at the package's top level
 * @param {string} packageDir
 * @returns {string[]}
 */
function findLicenseFiles(packageDir) {
  return readdirSync(packageDir)
    .filter((file) => /^(licen[cs]e|copying|notice)([.-].*)?$/i.test(file))
    .map((file) => path.join(packageDir, file))
    .filter((file) => statSync(file).isFile())
    .sort();
}

/** @type {Record<string, {licenses: string}>} */
const packages = {};
/** @type {Record<string, string[]>} each package's license files */
const packageFiles = {};

/** @param {Record<string, Dependency> | undefined} dependencies */
function collect(dependencies) {
  for (const [name, dependency] of Object.entries(dependencies ?? {})) {
    const key = `${name}@${dependency.version}`;
    if (key in packages || !dependency.path) continue;
    const license = readLicense(dependency.path);
    if (license === null) continue;
    packages[key] = { licenses: license };
    packageFiles[key] = findLicenseFiles(dependency.path);
    collect(dependency.dependencies);
  }
}
for (const project of projects) {
  collect(project.dependencies);
}

for (const work of INCLUDED) {
  const key = work.version ? `${work.name}@${work.version}` : work.name;
  packages[key] = { licenses: work.license };
}

const sorted = Object.fromEntries(
  Object.entries(packages).sort(([a], [b]) => a.localeCompare(b)),
);
writeFileSync(output, JSON.stringify(sorted, null, 2) + "\n");
console.log(`Wrote the licenses of ${Object.keys(sorted).length} packages`);

if (noticesOutput) {
  const rule = "-".repeat(79);
  /** @type {Map<string, string>} each license text, to what first gave it */
  const seen = new Map();

  /**
   * One work's section: its name, license and what it is, then its license
   * files' text, or a pointer to the same text given above
   * @param {string} title
   * @param {string[]} lines
   * @param {string[]} files
   */
  function section(title, lines, files) {
    const parts = [rule, title, ...lines, rule];
    for (const file of files) {
      const text = readFileSync(file, "utf8").trim();
      const first = seen.get(text);
      if (first) {
        parts.push(`${path.basename(file)}: the same text as ${first}'s.`);
      } else {
        seen.set(text, title.split(" (")[0]);
        parts.push(text);
      }
      parts.push("");
    }
    if (!files.length) {
      parts.push("Its package has no license file.", "");
    }
    return parts.join("\n");
  }

  const sections = [
    "Third-party notices for Doppelganger",
    "",
    "Doppelganger is free software under the GNU Affero General Public License,",
    "version 3 or later; its source code is at",
    "https://github.com/regulad/doppelganger. It is made with the works below,",
    "each under its own license, whose copyright lines and license texts follow:",
    "first the works copied into it, then the npm packages it ships.",
    "",
    ...INCLUDED.map((work) =>
      section(
        `${work.name}${work.version ? ` ${work.version}` : ""} (${work.license})`,
        [work.about],
        work.files.map((file) => path.resolve(import.meta.dirname, "..", file)),
      ),
    ),
    ...Object.entries(packageFiles)
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(([key]) => packages[key].licenses !== "UNLICENSED")
      .map(([key, files]) =>
        section(`${key} (${packages[key].licenses})`, [], files),
      ),
  ];
  writeFileSync(noticesOutput, sections.join("\n"));
  console.log(`Wrote the notices to ${noticesOutput}`);
}
