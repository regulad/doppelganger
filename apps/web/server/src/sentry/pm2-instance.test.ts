/**
 * @jest-environment node
 */

import { getPm2Instance } from "./pm2-instance.ts";

describe("getPm2Instance", () => {
  it("reads the instance from pm2_env before pm2 has copied it out", () => {
    // what a cluster worker's environment holds while --import modules run
    const env = {
      pm2_env: JSON.stringify({
        name: "server",
        instance_var: "NODE_APP_INSTANCE",
        NODE_APP_INSTANCE: 3,
      }),
    };
    expect(getPm2Instance(env)).toBe("3");
  });

  it("follows a renamed instance variable", () => {
    const env = {
      pm2_env: JSON.stringify({ instance_var: "WORKER", WORKER: 1 }),
    };
    expect(getPm2Instance(env)).toBe("1");
  });

  it("uses NODE_APP_INSTANCE once pm2 has set it", () => {
    expect(getPm2Instance({ NODE_APP_INSTANCE: "0" })).toBe("0");
  });

  it("says none outside pm2", () => {
    expect(getPm2Instance({})).toBe("none");
    expect(getPm2Instance({ pm2_env: "not json" })).toBe("none");
  });
});
