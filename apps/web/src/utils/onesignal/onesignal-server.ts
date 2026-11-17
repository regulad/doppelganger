import * as OneSignal from "@onesignal/node-onesignal";

// get the environment variables at runtime as opposed to build time
export default function getOneSignalClient() {
  // The app's API key alone: sending notifications is all the app does, and
  // the account-level key was never used
  const oneSignalConfiguration = OneSignal.createConfiguration({
    restApiKey: process.env.ONESIGNAL_API_KEY!,
  });

  return new OneSignal.DefaultApi(oneSignalConfiguration);
}
