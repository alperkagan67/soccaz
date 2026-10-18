import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/session";
import { earliestStartInput, myAdminTeams } from "@/server/requests";
import { RequestForm } from "./RequestForm";

export const metadata: Metadata = { title: "Gegner suchen" };

export default async function NewRequestPage() {
  const user = await requireUser("/app/suche/neu");
  const teams = await myAdminTeams(user.id);
  const min = earliestStartInput();

  return (
    <section className="mx-auto mt-4 max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Gegner suchen</h1>
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
