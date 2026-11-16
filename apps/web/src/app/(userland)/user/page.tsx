import {
  DeleteAccountCard,
  EmailChangeForm,
  PasswordChangeForm,
  SubscriptionChangeForm,
} from "@/app/(userland)/user/forms.tsx";
import { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "Account Settings",
};

export default async function AccountPage() {
  // Read when the page is requested: production's web.env sets this, not the
  // build
  await connection();
  const portalAvailable = Boolean(process.env.STRIPE_PORTAL_CONFIGURATION);

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Account Settings</h1>
      <SubscriptionChangeForm portalAvailable={portalAvailable} />
      <EmailChangeForm />
      <PasswordChangeForm />
      <DeleteAccountCard />
    </div>
  );
}
