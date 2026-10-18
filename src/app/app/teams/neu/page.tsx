import type { Metadata } from "next";
import { requireUser } from "@/server/session";
import { TeamForm } from "./TeamForm";

export const metadata: Metadata = { title: "Team gründen" };

export default async function NewTeamPage() {
  const user = await requireUser("/app/teams/neu");
  return (
    <section className="mx-auto mt-4 max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Team gründen</h1>
      <p className="text-muted">Danach lädst du deine Spieler per Link ein.</p>
      <TeamForm defaultCity={user.city ?? "Gelsenkirchen"} />
    </section>
  );
}
