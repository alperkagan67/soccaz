import type { Metadata } from "next";
import Link from "next/link";
import { getTeamBySlug } from "@/server/teams";
import { requireUser } from "@/server/session";
import { earliestStartInput, myAdminTeams } from "@/server/requests";
import { RequestForm } from "./RequestForm";

export const metadata: Metadata = { title: "Gegner suchen" };

export default async function NewRequestPage({ searchParams }: PageProps<"/app/suche/neu">) {
  const sp = await searchParams;
  const opponent = typeof sp.gegner === "string" ? sp.gegner.slice(0, 80) : undefined;
  const user = await requireUser(opponent ? `/app/suche/neu?gegner=${encodeURIComponent(opponent)}` : "/app/suche/neu");
  const teams = await myAdminTeams(user.id);
  const min = earliestStartInput();
  const target = opponent ? await getTeamBySlug(opponent) : null;
  const challengeable = target && !target.archivedAt && teams.some((t) => t.id !== target.id);

  return (
    <section className="mx-auto mt-4 max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{challengeable ? `${target.name} herausfordern` : "Gegner suchen"}</h1>
      {teams.length === 0 ? (
        <div className="card space-y-3">
          <p className="text-muted">Du brauchst ein Team, bei dem du Team-Admin bist.</p>
          <Link href="/app/teams/neu" className="btn btn-primary w-full">Team gründen</Link>
        </div>
      ) : (
        <RequestForm
          teams={teams}
          min={min}
          target={challengeable ? { id: target.id, name: target.name, city: target.city, strength: target.strength } : undefined}
        />
      )}
    </section>
  );
}
