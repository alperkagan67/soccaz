import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDateTime } from "@/lib/time";
import { getGameInvitePreview, joinPrivateGame } from "@/server/privategame";
import { getCurrentUser } from "@/server/session";
import { DomainError } from "@/server/teams";

export const metadata: Metadata = { title: "Einladung zum Spiel", robots: { index: false } };

/** Einladungslink zu einem Privatspiel: Angemeldete landen direkt im Spiel, Gäste melden sich an oder registrieren sich und kommen danach hierher zurück. */
export default async function GameInvitePage({ params }: PageProps<"/spiel/[token]">) {
  const { token } = await params;
  const [preview, user] = await Promise.all([getGameInvitePreview(token), getCurrentUser()]);
  if (user && !user.onboardedAt) redirect(`/willkommen?next=${encodeURIComponent(`/spiel/${token}`)}`);

  if (preview.status !== "valid") {
    const text = preview.status === "expired" ? "Dieser Einladungslink ist abgelaufen. Bitte den Veranstalter um einen neuen." : preview.status === "cancelled" ? "Dieses Spiel wurde abgesagt." : "Dieser Einladungslink ist ungültig oder wurde zurückgezogen. Bitte den Veranstalter um einen neuen.";
    return <Notice title="Einladung nicht gültig" text={text} />;
  }
  const { game, players } = preview;

  if (user) {
    try {
      const { matchId } = await joinPrivateGame(user.id, token);
      redirect(`/lobby/${matchId}`);
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      return <Notice title="Beitritt nicht möglich" text={error.message} />;
    }
  }

  return (
    <section className="mx-auto mt-8 max-w-sm space-y-4 text-center" data-testid="game-invite-page">
      <p className="text-sm text-muted">{game.organizer} lädt dich ein zu einem Privatspiel</p>
      <h1 className="text-3xl font-bold">Spiel #{game.number}</h1>
      <p className="text-muted">
        {formatDateTime(game.startsAt)} Uhr · {game.durationMin} Minuten{game.venueText ? ` · ${game.venueText}` : ""}
      </p>
      <p className="text-sm text-muted">{players} von {game.maxPlayers ?? 10} Plätzen belegt</p>
      <Link href={`/anmelden?next=${encodeURIComponent(`/spiel/${token}`)}`} className="btn btn-primary w-full">Anmelden oder registrieren und mitspielen</Link>
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
