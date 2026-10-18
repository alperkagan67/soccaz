import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateTime } from "@/lib/time";
import { strengthText } from "@/lib/labels";
import { getCurrentUser } from "@/server/session";
import { getRequest, myAdminTeams } from "@/server/requests";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { eq } from "drizzle-orm";
import { teamRoster, teamStrength } from "@/server/roster";
import { AcceptForm } from "./AcceptForm";
import { CancelButton } from "./CancelButton";

export const metadata: Metadata = { title: "Spielsuche" };

export default async function RequestPage({ params }: PageProps<"/suche/[id]">) {
  const { id } = await params;
  const request = await getRequest(id);
  if (!request) notFound();

  const user = await getCurrentUser();
  const adminTeams = user?.onboardedAt ? await myAdminTeams(user.id) : [];
  const isOwner = adminTeams.some((t) => t.id === request.teamId);
  const challenge = request.targetTeamId
    ? (await db.select({ id: teams.id, name: teams.name, slug: teams.slug }).from(teams).where(eq(teams.id, request.targetTeamId)))[0]
    : null;
  const acceptTeams = adminTeams.filter((t) => t.id !== request.teamId && (!challenge || t.id === challenge.id));

  const [roster, strength] = await Promise.all([teamRoster(request.teamId), teamStrength(request.teamId)]);

  const closedText =
    request.status === "matched"
      ? "Für diese Spielsuche wurde schon ein Gegner gefunden."
      : request.status === "cancelled"
        ? "Diese Spielsuche wurde zurückgezogen."
        : "Diese Spielsuche ist abgelaufen.";

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm text-muted">
          {challenge ? "Herausforderung" : request.visibility === "private" ? "Private Spielsuche (nur über Link)" : "Öffentliche Spielsuche"}
        </p>
        <h1 className="text-2xl font-bold">
          <Link href={`/teams/${request.teamSlug}`} className="hover:text-green">{request.teamName}</Link>{" "}
          {challenge ? (
            <>
              fordert <Link href={`/teams/${challenge.slug}`} className="hover:text-green">{challenge.name}</Link> heraus
            </>
          ) : (
            "sucht einen Gegner"
          )}
        </h1>
      </header>

      <dl className="card grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-muted">Anstoß</dt><dd className="font-semibold">{formatDateTime(request.startsAt)} Uhr</dd></div>
        <div><dt className="text-muted">Dauer</dt><dd className="font-semibold">{request.durationMin} Minuten</dd></div>
        <div><dt className="text-muted">Stadt</dt><dd className="font-semibold">{request.city}</dd></div>
        <div><dt className="text-muted">Gesuchte Stärke</dt><dd className="font-semibold">{strengthText(request.strength)}</dd></div>
        {request.note && <div className="col-span-2"><dt className="text-muted">Hinweis</dt><dd>{request.note}</dd></div>}
      </dl>

      <section className="card space-y-2" aria-label="Kader des suchenden Teams" data-testid="request-roster">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Kader von {request.teamName}</h2>
          <span className="text-xs text-muted">Elo {strength.elo}{strength.matches === 0 ? " (geschätzt)" : ""}</span>
        </div>
        <ul className="space-y-1 text-sm">
          {roster.map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-2">
              <Link href={`/spieler/${m.userId}`} className="hover:text-green">{m.name}</Link>
              <span className="text-xs text-muted">{[m.position, m.elo ? `Elo ${m.elo}` : null, m.isAdmin ? "Admin" : null].filter(Boolean).join(" · ")}</span>
            </li>
          ))}
        </ul>
      </section>

      {!request.isOpen ? (
        <p className="card text-muted">{closedText}</p>
      ) : isOwner ? (
        <CancelButton requestId={request.id} />
      ) : !user ? (
        <Link href={`/anmelden?next=${encodeURIComponent(`/suche/${request.id}`)}`} className="btn btn-primary w-full">
          Anmelden und annehmen
        </Link>
      ) : challenge && acceptTeams.length === 0 ? (
        <p className="card text-muted">Diese Herausforderung gilt {challenge.name}. Nur deren Team-Admins können sie annehmen.</p>
      ) : acceptTeams.length > 0 ? (
        <AcceptForm requestId={request.id} teams={acceptTeams.map((t) => ({ id: t.id, name: t.name }))} />
      ) : (
        <div className="card space-y-2">
          <p className="text-muted">Nur Team-Admins können eine Spielsuche annehmen. Du brauchst ein eigenes Team.</p>
          <Link href="/app/teams/neu" className="btn btn-ghost w-full">Team gründen</Link>
        </div>
      )}
    </div>
  );
}
