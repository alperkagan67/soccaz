import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ImageUpload } from "@/components/ImageUpload";
import { getPrefs } from "@/server/notifications";
import { requireUser } from "@/server/session";
import { DeleteAccountForm, ProfileForm } from "./ProfileForm";
import { PrefsForm } from "./PrefsForm";
import { PushToggle } from "./PushToggle";

export const metadata: Metadata = { title: "Einstellungen" };

export default async function SettingsPage() {
  const user = await requireUser("/app/einstellungen");
  const prefs = await getPrefs(user.id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Einstellungen</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Profil</h2>
        <div className="flex items-center gap-4">
          {user.avatarUrl ? (
            <Image src={user.avatarUrl} alt="Dein Profilbild" width={64} height={64} unoptimized className="size-16 rounded-full object-cover" />
          ) : (
            <div className="grid size-16 place-items-center rounded-full bg-panel2 text-xl font-bold text-muted" aria-hidden>
              {user.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="space-y-1">
            <ImageUpload kind="avatar" refId={user.id} label="Profilbild ändern" />
            <Link href={`/spieler/${user.id}`} className="block text-sm text-green underline">
              Mein Profil ansehen
            </Link>
          </div>
        </div>
        <ProfileForm name={user.name} city={user.city ?? null} position={user.position ?? null} profilePublic={user.profilePublic} bio={user.bio ?? null} gamer={{ nickname: user.nickname ?? null, accentColor: user.accentColor ?? null, shirtNumber: user.shirtNumber ?? null, favoriteClub: user.favoriteClub ?? null, strongFoot: user.strongFoot ?? null }} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Benachrichtigungen</h2>
        <PushToggle vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
        <PrefsForm push={prefs.push} email={prefs.email} disabledTypes={prefs.disabledTypes} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Deine Daten</h2>
        <a href="/api/mein-konto/export" className="btn btn-ghost w-full" download>
          Alle meine Daten herunterladen (JSON)
        </a>
        <details className="space-y-2">
          <summary className="cursor-pointer text-sm text-coral">Konto löschen</summary>
          <div className="mt-2">
            <DeleteAccountForm />
          </div>
        </details>
      </section>
    </div>
  );
}
