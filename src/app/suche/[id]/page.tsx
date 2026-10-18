import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateTime } from "@/lib/time";
import { strengthText } from "@/lib/labels";
import { getCurrentUser } from "@/server/session";
import { getRequest, myAdminTeams } from "@/server/requests";
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
  const acceptTeams = adminTeams.filter((t) => t.id !== request.teamId);

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
          {request.visibility === "private" ? "Private Spielsuche (nur über Link)" : "Öffentliche Spielsuche"}
        </p>
        <h1 className="text-2xl font-bold">
          <Link href={`/teams/${request.teamSlug}`} className="hover:text-green">{request.teamName}</Link> sucht einen Gegner
        </h1>
      </header>

      <dl className="card grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-muted">Anstoß</dt><dd className="font-semibold">{formatDateTime(request.startsAt)} Uhr</dd></div>
        <div><dt className="text-muted">Dauer</dt><dd className="font-semibold">{request.durationMin} Minuten</dd></div>
        <div><dt className="text-muted">Stadt</dt><dd className="font-semibold">{request.city}</dd></div>
        <div><dt className="text-muted">Gesuchte Stärke</dt><dd className="font-semibold">{strengthText(request.strength)}</dd></div>
        {request.note && <div className="col-span-2"><dt className="text-muted">Hinweis</dt><dd>{request.note}</dd></div>}
      </dl>

      {!request.isOpen ? (
        <p className="card text-muted">{closedText}</p>
      ) : isOwner ? (
        <CancelButton requestId={request.id} />
      ) : !user ? (
        <Link href={`/anmelden?next=${encodeURIComponent(`/suche/${request.id}`)}`} className="btn btn-primary w-full">
          Anmelden und annehmen
        </Link>
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
