import type { Metadata } from "next";
import { nextQuarterHourInput } from "@/lib/time";
import { requireUser } from "@/server/session";
import { PrivateGameForm } from "./PrivateGameForm";

export const metadata: Metadata = { title: "Privatspiel anlegen" };

export default async function NewPrivateGamePage() {
  const user = await requireUser("/app/privatspiel/neu");
  return (
    <section className="mx-auto mt-4 max-w-md space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Privatspiel anlegen</h1>
        <p className="text-sm text-muted">Für deine Freundesgruppe: nicht öffentlich, nur über den Einladungslink erreichbar, zählt nicht für die Rangliste. Du teilst die Spieler in Team Rot und Team Blau ein oder lässt zufällig verteilen.</p>
      </div>
      <PrivateGameForm min={nextQuarterHourInput()} defaultCity={user.city} />
    </section>
  );
}
