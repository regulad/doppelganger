jest.mock("react-onesignal", () => ({}));
jest.mock("@/utils/supabase/client.ts", () => ({ createClient: jest.fn() }));
jest.mock("@/app/api/onesignal/route.ts", () => ({}));

import { isOneSignalScriptBlocked } from "./one-signal-provider";

describe("isOneSignalScriptBlocked", () => {
  it("recognizes react-onesignal's rejection when the SDK never loaded", () => {
    expect(
      isOneSignalScriptBlocked(new Error("OneSignal script failed to load.")),
    ).toBe(true);
  });

  it("doesn't mistake other OneSignal failures for a blocked SDK", () => {
    expect(
      isOneSignalScriptBlocked(new Error("OneSignal is already initialized.")),
    ).toBe(false);
    expect(isOneSignalScriptBlocked("OneSignal script failed to load.")).toBe(
      false,
    );
  });
});
