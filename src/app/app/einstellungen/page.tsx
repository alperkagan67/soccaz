import type { Metadata } from "next";
import { getPrefs } from "@/server/notifications";
import { requireUser } from "@/server/session";
import { PrefsForm } from "./PrefsForm";
import { PushToggle } from "./PushToggle";

export const metadata: Metadata = { title: "Einstellungen" };

export default async function SettingsPage() {
  const user = await requireUser("/app/einstellungen");
  const prefs = await getPrefs(user.id);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Einstellungen</h1>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Benachrichtigungen</h2>
        <PushToggle vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
        <PrefsForm push={prefs.push} email={prefs.email} disabledTypes={prefs.disabledTypes} />
      </section>
    </div>
  );
}
