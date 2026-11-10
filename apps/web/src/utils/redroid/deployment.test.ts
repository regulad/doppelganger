/**
 * @jest-environment node
 */

import { SampleDeviceSpecs } from "%/device-info/device-specs.ts";
import allRedroidImages, {
  defaultRedroidImage,
  RedroidImage,
} from "%/device-info/redroid-images.ts";
import {
  createDockerTemplateFromView,
  getInsertableDeviceForView,
} from "@/utils/docker/docker-compose-moustache-formatting.ts";
import {
  completeImageName,
  getDockerImageInfo,
} from "@/utils/docker/docker-image-parsing.ts";
import Ajv from "ajv-draft-04";
import addFormats from "ajv-formats";
import { stringify as stringifyYaml, parse as yamlParse } from "yaml";
import dockerComposeSpec from "./compose_spec.json";
import { createView } from "./deployment.ts";

jest.mock("@/utils/docker/docker-api-utils.ts", () => ({
  getLatestDigestOfImage: jest.fn().mockResolvedValue("sha256:digest"),
  upgradeDockerImageInfo: jest.fn().mockImplementation(async (info) => ({
    ...info,
    digest: "sha256:digest",
  })),
}));

const ajv = new Ajv({
  schemaId: "id",
  meta: false,
  strict: false,
  strictSchema: false,
  strictNumbers: false,
  allowMatchingProperties: true,
  allowUnionTypes: true,
  validateFormats: false,
});
addFormats(ajv);
const validate = ajv.compile({ ...dockerComposeSpec, $schema: undefined });

describe("createView", () => {
  it("should create a valid DockerComposeMoustacheView with explicit settings", async () => {
    const fps = 30;
    const specs: SampleDeviceSpecs = {
      name: "",
      dpi: 160,
      width: 720,
      height: 1280,
    };
    const view = await createView(defaultRedroidImage, fps, specs);

    expect(view).toBeDefined();
    expect(view.id).toBeDefined();
    expect(view.redroidImage).toContain(defaultRedroidImage.imageName);
    expect(view.baseDir).toBeDefined();
    expect(view.externalNetworkName).toBeDefined();
    expect(view.redroidImageDataBasePath).toBeDefined();
    expect(view.redroidFps).toEqual(fps);
    expect(view.redroidDpi).toEqual(specs.dpi);
    expect(view.redroidWidth).toEqual(specs.width);
    expect(view.redroidHeight).toEqual(specs.height);
  }, 60_000); // needs time to fetch the digest

  it("should create a view that can create a valid YAML file", async () => {
    const fps = 30;
    const specs: SampleDeviceSpecs = {
      name: "",
      dpi: 160,
      width: 720,
      height: 1280,
    };
    const view = await createView(defaultRedroidImage, fps, specs);
    const yaml = await createDockerTemplateFromView(view);
    const parsedYaml = yamlParse(yaml);
    const stringifiedYaml = stringifyYaml(parsedYaml);
    console.log(stringifiedYaml);
  }, 60_000); // needs time to fetch the digest

  it("should validate the generated Docker Compose YAML against the JSON Schema", async () => {
    const fps = 30;
    const specs = {
      name: "",
      dpi: 160,
      width: 720,
      height: 1280,
    };
    const view = await createView(defaultRedroidImage, fps, specs);
    const yaml = await createDockerTemplateFromView(view);
    const parsedYaml = yamlParse(yaml);

    const valid = validate(parsedYaml);
    expect(valid).toBe(true);
  }, 60_000); // Adjust timeout as necessary

  const specs = { dpi: 160, width: 720, height: 1280 };
  async function redroidCommandFor(image: RedroidImage): Promise<string[]> {
    const view = await createView(image, 30, specs);
    const parsedYaml = yamlParse(await createDockerTemplateFromView(view));
    expect(validate(parsedYaml)).toBe(true);
    return parsedYaml.services.redroid.command;
  }

  it("should store each image's imageName unchanged, as devices are keyed by it", async () => {
    const view = await createView(defaultRedroidImage, 30, specs);
    allRedroidImages.forEach((image) => {
      // as initializeDevice does
      const dockerImageInfo = getDockerImageInfo(
        completeImageName(image.imageName, true),
      );
      const device = getInsertableDeviceForView(
        view,
        dockerImageInfo,
        "owner",
        "device",
      );
      expect(device.redroidImage).toBe(image.imageName);
    });
  });

  it("should boot images on memfd only if they are marked memfd", async () => {
    expect(defaultRedroidImage.memfd).toBe(true);
    expect(await redroidCommandFor(defaultRedroidImage)).toContain(
      "androidboot.use_memfd=true",
    );

    const ashmemImage = { ...defaultRedroidImage, memfd: false };
    expect(await redroidCommandFor(ashmemImage)).not.toContain(
      "androidboot.use_memfd=true",
    );
  });
});
