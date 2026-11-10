import JSON5 from "json5";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import allRedroidImages, {
  getDefaultRedroidImage,
  getRedroidImage,
  isDeployable,
} from "./redroid-images.ts";

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
      expect(image).toHaveProperty("memfd");
      expect(image).toHaveProperty("androidSdkVersion");
    });
  });

  it("image names should be unique, as devices are keyed by them", () => {
    const imageNames = allRedroidImages.map((image) => image.imageName);
    expect(new Set(imageNames).size).toBe(imageNames.length);
  });

  it("image names should name a tag, not a digest", () => {
    // a device keeps the digest it was made from, in its compose file
    allRedroidImages.forEach((image) => {
      expect(image.imageName).not.toContain("@");
      expect(image.imageName).toMatch(/:[\w][\w.-]*$/);
    });
  });

  it("should still find the images that existing devices are keyed by", () => {
    // a deprecated image, which devices made before still use
    const image = getRedroidImage(
      "cr.regulad.xyz/regulad/redroid-script:12.0.0-gapps-latest",
    );
    expect(image).not.toBeNull();
    expect(image!.usable).toBe(false);
    expect(image!.gms).toBe(true);
    expect(image!.memfd).toBe(true);
  });

  it("the default image should be usable and free", () => {
    const defaultRedroidImage = getDefaultRedroidImage(true)!;
    expect(defaultRedroidImage.usable).toBe(true);
    expect(defaultRedroidImage.premium).toBe(false);
  });

  it("should not deploy images that need ashmem to a host without it", () => {
    const ashmemImage = allRedroidImages.find(
      (image) => image.usable && !image.memfd,
    )!;
    expect(isDeployable(ashmemImage, true)).toBe(true);
    expect(isDeployable(ashmemImage, false)).toBe(false);
    expect(isDeployable({ ...ashmemImage, memfd: true }, false)).toBe(true);
    expect(isDeployable({ ...ashmemImage, usable: false }, true)).toBe(false);

    const defaultRedroidImage = getDefaultRedroidImage(false);
    expect(defaultRedroidImage).not.toBeNull();
    expect(defaultRedroidImage!.memfd).toBe(true);
  });

  it("should not contain usable images that are older than Android 14", () => {
    // older versions are deprecated: Android 14 is the oldest still patched in
    // Google's Android Security Bulletins (2026-11)
    allRedroidImages.forEach((image) => {
      if (image.usable) {
        expect(image.androidSdkVersion).toBeGreaterThanOrEqual(34);
      }
    });
  });

  it("usable images should be free up to Android 14", () => {
    // Android 14 is the oldest version still in Google's security bulletins (2026-11)
    allRedroidImages.forEach((image) => {
      if (image.usable) {
        expect(image.premium).toBe(image.androidSdkVersion > 34);
      }
    });
    expect(getDefaultRedroidImage(true)!.androidSdkVersion).toBe(34);
  });

  it("only Android 16 and newer should need the host's ashmem", () => {
    // Android 16 needs ashmem on any kernel without Android's memfd patches
    allRedroidImages.forEach((image) => {
      if (image.usable) {
        expect(image.memfd).toBe(image.androidSdkVersion < 36);
      }
    });
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
