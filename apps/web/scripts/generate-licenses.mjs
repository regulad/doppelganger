// Writes the /licenses page's list: each package the web app ships in
// production, with its license.
//
// pnpm list gives the production dependency tree from what's installed, and
// each package's own package.json gives its license. Neither needs pnpm's
// store, which the image's build step doesn't have (pnpm licenses list does
// need it). license-checker, which this replaces, walks node_modules, and
// under pnpm it saw only about a tenth of the packages.
//
// Usage: node scripts/generate-licenses.mjs <output.json>
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [output] = process.argv.slice(2);
if (!output) {
  throw new Error("usage: generate-licenses.mjs <output.json>");
}

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

/** @type {Record<string, {licenses: string}>} */
const packages = {};

/** @param {Record<string, Dependency> | undefined} dependencies */
function collect(dependencies) {
  for (const [name, dependency] of Object.entries(dependencies ?? {})) {
    const key = `${name}@${dependency.version}`;
    if (key in packages || !dependency.path) continue;
    const license = readLicense(dependency.path);
    if (license === null) continue;
    packages[key] = { licenses: license };
    collect(dependency.dependencies);
  }
}
for (const project of projects) {
  collect(project.dependencies);
}

const sorted = Object.fromEntries(
  Object.entries(packages).sort(([a], [b]) => a.localeCompare(b)),
);
writeFileSync(output, JSON.stringify(sorted, null, 2) + "\n");
console.log(`Wrote the licenses of ${Object.keys(sorted).length} packages`);
