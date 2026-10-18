import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatDateTime } from "@/lib/time";
import { requireUser } from "@/server/session";
import { getLobby } from "@/server/lobby";

export const metadata: Metadata = { title: "Lobby", robots: { index: false } };

export default async function LobbyPage({ params }: PageProps<"/lobby/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/lobby/${id}`);
  const lobby = await getLobby(id);
  if (!lobby) notFound();
  const { match, participants } = lobby;

  const isParticipant = participants.some((p) => p.userId === user.id);
  if (match.visibility === "private" && !isParticipant && user.role !== "admin") redirect("/app");

  const team = (teamId: string, name: string, slug: string) => (
    <section className="card space-y-2">
      <h2 className="font-semibold">
        <Link href={`/teams/${slug}`} className="hover:text-green">{name}</Link>
      </h2>
      <ul className="space-y-1 text-sm">
        {participants.filter((p) => p.teamId === teamId).map((p) => (
          <li key={p.userId} className="flex justify-between">
            <span>{p.name}</span>
            <span className={p.readyAt ? "text-green" : "text-muted"}>{p.readyAt ? "Bereit" : "Offen"}</span>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm text-muted">Lobby</p>
        <h1 className="text-2xl font-bold">
          {match.homeName} <span className="text-muted">gegen</span> {match.awayName}
        </h1>
        <p className="text-muted">{formatDateTime(match.startsAt)} Uhr · {match.durationMin} Minuten</p>
      </header>

      <p className="card text-sm text-muted">
        Das Spiel ist angesetzt. Ort, Teilnehmer und der Bereit-Status kommen im nächsten Schritt (Lobby-Funktionen).
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {team(match.homeId, match.homeName, match.homeSlug)}
        {team(match.awayId, match.awayName, match.awaySlug)}
      </div>
    </div>
  );
}
