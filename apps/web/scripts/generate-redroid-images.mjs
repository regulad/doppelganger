// Writes server/src/device-info/redroid-images.json, which the code imports,
// from redroid-images.json5, which is the file to edit.
import JSON5 from "json5";
import { readFile, writeFile } from "node:fs/promises";

const catalog = new URL("../server/src/device-info/", import.meta.url);

const images = JSON5.parse(
  await readFile(new URL("redroid-images.json5", catalog), "utf-8"),
);
await writeFile(
  new URL("redroid-images.json", catalog),
  `${JSON.stringify(images, null, 2)}\n`,
);
