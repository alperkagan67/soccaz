import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { formatDateTime } from "@/lib/time";
import { applyProEventAction, withdrawProApplicationAction } from "@/server/league-actions";
import { getProEvent } from "@/server/pro-events";
import { myAdminTeams } from "@/server/requests";
import { getCurrentUser } from "@/server/session";
import { ApplyForm } from "./ApplyForm";

export async function generateMetadata({ params }: PageProps<"/profitag/[id]">): Promise<Metadata> {
  const { id } = await params;
  const data = await getProEvent(id);
  return { title: data ? data.event.title : "Profi-Tag nicht gefunden" };
}

export default async function ProEventPage({ params }: PageProps<"/profitag/[id]">) {
  const { id } = await params;
  const data = await getProEvent(id);
  if (!data) notFound();
  const { event, applicants } = data;
  const user = await getCurrentUser();
  const mine = user?.onboardedAt ? await myAdminTeams(user.id) : [];
  const applied = new Set(applicants.map((a) => a.teamId));
  const open = event.applyOpen;
  const eligible = mine.filter((t) => t.id !== event.proTeamId && !applied.has(t.id));

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">{event.title}</h1>
        <p className="text-muted">
          <Link href={`/teams/${event.proSlug}`} className="font-semibold text-ink hover:text-green">{event.proTeam}</Link> · {event.city} · {formatDateTime(event.startsAt)} Uhr
        </p>
        {event.description && <p className="text-sm">{event.description}</p>}
      </header>

      <dl className="card grid grid-cols-3 gap-3 text-sm">
        <div><dt className="text-muted">Plätze</dt><dd className="font-semibold">{event.slots}</dd></div>
        <div><dt className="text-muted">Spieldauer</dt><dd className="font-semibold">{event.slotMinutes} Min</dd></div>
        <div><dt className="text-muted">Bewerben bis</dt><dd className="font-semibold">{formatDateTime(event.applyUntil)}</dd></div>
      </dl>

      {event.status === "cancelled" && <p className="card text-coral">Der Profi-Tag wurde abgesagt.</p>}
      {event.status === "drawn" && <p className="card text-green">Ausgelost. Die Gewinner-Teams stehen unten.</p>}

      {open && !user && (
        <Link href={`/anmelden?next=${encodeURIComponent(`/profitag/${event.id}`)}`} className="btn btn-primary w-full">Anmelden und bewerben</Link>
      )}
      {open && user && eligible.length > 0 && <ApplyForm action={applyProEventAction.bind(null, event.id)} teams={eligible.map((t) => ({ id: t.id, name: t.name }))} />}
      {open && user && mine.length === 0 && <p className="card text-sm text-muted">Nur Team-Admins können sich bewerben.</p>}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Bewerbungen ({applicants.length})</h2>
        {applicants.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Bewerbung.</p>
        ) : (
          <ul className="space-y-2">
            {applicants.map((a) => (
              <li key={a.teamId} className="card flex items-center justify-between gap-2">
                <Link href={`/teams/${a.slug}`} className="font-semibold hover:text-green">{a.name}</Link>
                <span className="flex items-center gap-3 text-sm">
                  {event.status === "drawn" && (a.selected ? <span className="text-green">Gewonnen</span> : <span className="text-muted">Nicht gelost</span>)}
                  {a.selected && a.matchId && <Link href={`/spiele/${a.matchId}`} className="text-green underline">Spiel</Link>}
                  {open && mine.some((t) => t.id === a.teamId) && <ActionButton action={withdrawProApplicationAction.bind(null, event.id, a.teamId)} label="Zurückziehen" />}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
