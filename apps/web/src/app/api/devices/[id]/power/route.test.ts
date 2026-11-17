/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

const getUser = jest.fn();
const getDeviceForId = jest.fn();
const getDevicePowerState = jest.fn();

jest.mock("@/utils/supabase/server.ts", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
jest.mock("%/device-info/device-info.ts", () => ({
  getDeviceForId: (id: string) => getDeviceForId(id),
}));
jest.mock("%/docker/device-state.ts", () => ({
  getDevicePowerState: (device: unknown) => getDevicePowerState(device),
}));

import { GET } from "./route";

const request = () =>
  new NextRequest("https://doppelgangerhq.com/api/devices/abc123/power");

beforeEach(() => {
  jest.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "user1" } } });
  getDeviceForId.mockResolvedValue({ id: "abc123", ownerId: "user1" });
});

describe("a device's power state", () => {
  it("says the device is still booting", async () => {
    getDevicePowerState.mockResolvedValue("booting");

    const res = await GET(request());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: "booting" });
    expect(getDeviceForId).toHaveBeenCalledWith("abc123");
  });

  it("asks a visitor who isn't signed in to sign in", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(getDevicePowerState).not.toHaveBeenCalled();
  });

  it("doesn't say whether someone else's device exists", async () => {
    getDeviceForId.mockResolvedValue({ id: "abc123", ownerId: "user2" });

    const res = await GET(request());

    expect(res.status).toBe(404);
    expect(getDevicePowerState).not.toHaveBeenCalled();
  });
});
