import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/session";
import { earliestStartInput, myAdminTeams } from "@/server/requests";
import { RequestForm } from "./RequestForm";

export const metadata: Metadata = { title: "Spielsuche mit festem Termin" };

export default async function NewRequestPage({ searchParams }: PageProps<"/app/suche/neu">) {
  const sp = await searchParams;
  const opponent = typeof sp.gegner === "string" ? sp.gegner.slice(0, 80) : undefined;
  if (opponent) redirect(`/teams/${encodeURIComponent(opponent)}`); // Herausfordern geht jetzt mit einem Klick auf der Teamseite
  const user = await requireUser("/app/suche/neu");
  const teams = await myAdminTeams(user.id);
  const min = earliestStartInput();

  return (
    <section className="mx-auto mt-4 max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Spielsuche mit festem Termin</h1>
      <p className="text-sm text-muted">Du legst Zeit und Dauer fest, jedes Team kann die Suche in den offenen Lobbys annehmen. Lieber flexibel? Dann nutze das <Link href="/matchmaking" className="text-green underline">Matchmaking</Link>.</p>
      {teams.length === 0 ? (
        <div className="card space-y-3">
          <p className="text-muted">Du brauchst ein Team, bei dem du Team-Admin bist.</p>
          <Link href="/app/teams/neu" className="btn btn-primary w-full">Team gründen</Link>
        </div>
      ) : (
        <RequestForm teams={teams} min={min} />
      )}
    </section>
  );
}
