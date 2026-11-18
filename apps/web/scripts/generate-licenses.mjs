// Writes the /licenses page's list: each package the web app ships in
// production, with its license, as pnpm reads them from the lockfile.
// license-checker, which this replaces, walks node_modules, and under pnpm it
// saw only about a tenth of them.
//
// Usage: node scripts/generate-licenses.mjs <output.json>
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const [output] = process.argv.slice(2);
if (!output) {
  throw new Error("usage: generate-licenses.mjs <output.json>");
}

/** @type {Record<string, Array<{name: string, version?: string, versions?: string[]}>>} */
const byLicense = JSON.parse(
  execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }),
);

/** @type {Record<string, {licenses: string}>} */
const packages = {};
for (const [license, entries] of Object.entries(byLicense)) {
  for (const entry of entries) {
    // pnpm 8 gives each package one version; later releases list several
    for (const version of entry.versions ?? [entry.version]) {
      packages[`${entry.name}@${version}`] = { licenses: license };
    }
  }
}

const sorted = Object.fromEntries(
  Object.entries(packages).sort(([a], [b]) => a.localeCompare(b)),
);
writeFileSync(output, JSON.stringify(sorted, null, 2) + "\n");
console.log(`Wrote the licenses of ${Object.keys(sorted).length} packages`);
