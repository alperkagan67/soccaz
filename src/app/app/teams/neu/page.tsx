import type { Metadata } from "next";
import { requireUser } from "@/server/session";
import { TeamForm } from "./TeamForm";

export const metadata: Metadata = { title: "Team gründen" };

export default async function NewTeamPage({ searchParams }: PageProps<"/app/teams/neu">) {
  const sp = await searchParams;
  // Rücksprungziel (z. B. ins Turnier): nur interne Pfade; die endgültige Prüfung macht createTeamAction
  const raw = typeof sp.next === "string" ? sp.next : "";
  const next = raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\") ? raw : undefined;
  const user = await requireUser(next ? `/app/teams/neu?next=${encodeURIComponent(next)}` : "/app/teams/neu");
  return (
    <section className="mx-auto mt-4 max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Team gründen</h1>
      <p className="text-muted">Danach lädst du deine Spieler per Link ein.</p>
      <TeamForm defaultCity={user.city ?? "Gelsenkirchen"} next={next} />
    </section>
  );
}
