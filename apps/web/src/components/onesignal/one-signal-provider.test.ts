jest.mock("react-onesignal", () => ({}));
jest.mock("@/utils/supabase/client.ts", () => ({ createClient: jest.fn() }));
jest.mock("@/app/api/onesignal/route.ts", () => ({}));

import { isOneSignalUnavailable } from "./one-signal-provider";

describe("isOneSignalUnavailable", () => {
  it("recognizes react-onesignal's rejection when the SDK never loaded", () => {
    expect(
      isOneSignalUnavailable(new Error("OneSignal script failed to load.")),
    ).toBe(true);
  });

  it("recognizes the SDK's SecurityError when the site's storage is blocked", () => {
    expect(
      isOneSignalUnavailable(
        new DOMException(
          "Failed to read the 'localStorage' property from 'Window': Access is denied for this document.",
          "SecurityError",
        ),
      ),
    ).toBe(true);
  });

  it("doesn't mistake other OneSignal failures for an unavailable SDK", () => {
    expect(
      isOneSignalUnavailable(new Error("OneSignal is already initialized.")),
    ).toBe(false);
    expect(isOneSignalUnavailable("OneSignal script failed to load.")).toBe(
      false,
    );
    expect(
      isOneSignalUnavailable(new DOMException("Aborted", "AbortError")),
    ).toBe(false);
  });
});
