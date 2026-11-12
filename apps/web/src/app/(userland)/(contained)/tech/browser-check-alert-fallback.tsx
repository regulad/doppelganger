import { Suspense } from "react";
import BrowserCheckAlertSkeleton from "./browser-check-alert-skeleton.tsx";
import BrowserCheckAlert from "./browser-check-alert.tsx";

// BrowserCheckAlert is a Server Component (it reads the request's
// user-agent), so it streams in behind the skeleton
export default function BrowserCheckAlertFallback() {
  return (
    <Suspense fallback={<BrowserCheckAlertSkeleton />}>
      <BrowserCheckAlert />
    </Suspense>
  );
}
