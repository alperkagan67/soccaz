import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/session";
import { getInvitePreview } from "@/server/teams";
import { JoinForm } from "./JoinForm";

export const metadata: Metadata = { title: "Einladung", robots: { index: false } };

export default async function InvitePage({ params }: PageProps<"/einladung/[token]">) {
  const { token } = await params;
  const [preview, user] = await Promise.all([getInvitePreview(token), getCurrentUser()]);
  // Frisch angemeldet, aber noch nicht eingerichtet: erst Onboarding, danach zurück zur Einladung.
  if (user && !user.onboardedAt) redirect(`/willkommen?next=${encodeURIComponent(`/einladung/${token}`)}`);

  if (preview.status === "invalid") {
    return <Notice title="Link ungültig" text="Diesen Einladungslink gibt es nicht. Bitte frag den Team-Admin nach einem neuen." />;
  }
  if (preview.status === "expired") {
    return <Notice title="Link abgelaufen" text={`Die Einladung für ${preview.team.teamName} ist abgelaufen. Bitte den Team-Admin um einen neuen Link.`} />;
  }

  const { team, members } = preview;

  return (
    <section className="mx-auto mt-8 max-w-sm space-y-4 text-center">
      <p className="text-sm text-muted">Du wurdest eingeladen zu</p>
      <h1 className="text-3xl font-bold">{team.teamName}</h1>
      <p className="text-muted">{team.city} · {members} {members === 1 ? "Spieler" : "Spieler"} im Kader</p>
      {user ? (
        <JoinForm token={token} />
      ) : (
        <Link href={`/anmelden?next=${encodeURIComponent(`/einladung/${token}`)}`} className="btn btn-primary w-full">
          Anmelden und beitreten
        </Link>
      )}
    </section>
  );
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <section className="mx-auto mt-10 max-w-sm space-y-3 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-muted">{text}</p>
      <Link href="/" className="btn btn-ghost">Zur Startseite</Link>
    </section>
  );
}
