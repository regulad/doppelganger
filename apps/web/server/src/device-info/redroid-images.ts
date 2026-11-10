// image sources:
// - https://github.com/remote-android/redroid-doc
// - https://github.com/abing7k/redroid-script

import allRedroidImagesJson from "./redroid-images.json"; // generated from redroid-images.json5, the file to edit

export interface RedroidImage {
  name: string;
  description: string;
  // The image's key: devices store it as their redroidImage, so it never
  // changes.
  imageName: string;
  usable: boolean; // if an image is allowed to be deployed
  premium: boolean; // if a paid membership is required to use the image
  gms: boolean; // if the image has Google Mobile Services & requires GMS init
  memfd: boolean; // if the image boots with androidboot.use_memfd=true; if not, it uses the host's ashmem
  androidSdkVersion: number;
}

const allRedroidImages: RedroidImage[] = allRedroidImagesJson;

// if an image may be deployed on a host; one not on memfd needs the host's ashmem
// (see hostHasAshmem in %/docker/host-kernel.ts)
export function isDeployable(
  image: RedroidImage,
  hostHasAshmem: boolean,
): boolean {
  return image.usable && (image.memfd || hostHasAshmem);
}

// the last free image in the list that the host can deploy
export function getDefaultRedroidImage(
  hostHasAshmem: boolean,
): RedroidImage | null {
  return (
    allRedroidImages
      .toReversed()
      .find((image) => isDeployable(image, hostHasAshmem) && !image.premium) ??
    null
  );
}

export function getRedroidImage(imageName: string): RedroidImage | null {
  return (
    allRedroidImages.find((image) => image.imageName === imageName) ?? null
  );
}

export default allRedroidImages;
