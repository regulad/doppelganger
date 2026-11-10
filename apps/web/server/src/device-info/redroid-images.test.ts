import JSON5 from "json5";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import allRedroidImages from "./redroid-images.ts";

const catalogSource = readFileSync(
  join(__dirname, "redroid-images.json5"),
  "utf-8",
);

describe("Redroid Images Tests", () => {
  it("should be generated from redroid-images.json5", () => {
    // if not, run pnpm catalog:generate
    expect(allRedroidImages).toEqual(JSON5.parse(catalogSource));
  });

  it("should give the reason beside each usable: false", () => {
    const lines = catalogSource
      .split("\n")
      .filter((line) => /^\s*"usable":\s*false\b/.test(line));
    expect(lines.length).toBe(
      allRedroidImages.filter((image) => !image.usable).length,
    );
    lines.forEach((line) => expect(line).toMatch(/\/\/\s*\S/));
  });

  // Existing test...
  it("usable images should have androidSdkVersion >= 29", () => {
    allRedroidImages.forEach((image) => {
      if (image.usable) {
        expect(image.androidSdkVersion).toBeGreaterThanOrEqual(29);
      }
    });
  });

  // Test for Validity of All Images
  it("all images should have valid properties", () => {
    allRedroidImages.forEach((image) => {
      expect(image).toHaveProperty("name");
      expect(image).toHaveProperty("description");
      expect(image).toHaveProperty("imageName");
      expect(image).toHaveProperty("usable");
      expect(image).toHaveProperty("premium");
      expect(image).toHaveProperty("gms");
      expect(image).toHaveProperty("androidSdkVersion");
    });
  });

  it("image names should be unique, as devices are keyed by them", () => {
    const imageNames = allRedroidImages.map((image) => image.imageName);
    expect(new Set(imageNames).size).toBe(imageNames.length);
  });

  // Test for At Least One Usable Free Image
  it("there should be at least one usable free image with gms", () => {
    const usableFreeImage = allRedroidImages.some(
      (image) => image.usable && image.gms && !image.premium,
    );
    expect(usableFreeImage).toBe(true);
  });

  it("should not contain usable images that are older than Android 12", () => {
    // requirement for sound copying: https://github.com/Genymobile/scrcpy/blob/master/doc/audio.md
    allRedroidImages.forEach((image) => {
      if (image.usable) {
        // if its not Android 12 or newer, audio doesn't work. don't give the users the option to use it
        expect(image.androidSdkVersion).toBeGreaterThanOrEqual(31);
      }
    });
  });
});
