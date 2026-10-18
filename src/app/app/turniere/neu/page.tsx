import type { Metadata } from "next";
import { requireUser } from "@/server/session";
import { TournamentForm } from "./TournamentForm";

export const metadata: Metadata = { title: "Turnier anlegen" };

export default async function NewTournamentPage() {
  const user = await requireUser("/app/turniere/neu");
  const allowed = user.isOrganizer || user.role === "admin";
  const today = new Date().toISOString().slice(0, 10);
  return (
    <section className="mx-auto mt-4 max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Turnier anlegen</h1>
      {allowed ? (
        <TournamentForm min={today} defaultCity={user.city} />
      ) : (
        <p className="card text-muted">Turniere dürfen nur freigeschaltete Veranstalter anlegen. Schreib uns, wenn du ein Turnier veranstalten möchtest.</p>
      )}
    </section>
  );
}
