import Link from "next/link";
import type { CardViewer } from "@/lib/player-card";

/**
 * Torjäger der Teamseite. Namen und Profil-Links nur für die Sicht "member" (angemeldet, kein reiner Hallenbetreiber, AC-17):
 * ein reiner Hallenbetreiber ("hall") und Gäste bekommen den Block nicht (security-reviewer R-T372 zu PR 5a, Backlog 216).
 */
export function TopScorers({ scorers, viewer }: { scorers: { id: string; name: string; goals: number }[]; viewer: CardViewer }) {
  if (viewer.kind !== "member" || scorers.length === 0) return null;
  return (
    <section className="space-y-2" aria-label="Torjäger" data-testid="top-scorers">
      <h2 className="text-lg font-semibold">Torjäger</h2>
      <ol className="space-y-1 text-sm">
        {scorers.map((s, i) => (
          <li key={s.id} className="flex justify-between">
            <span><span className="mr-2 text-muted">{i + 1}.</span><Link href={`/spieler/${s.id}`} className="hover:text-accent-fg">{s.name}</Link></span>
            <span className="font-semibold">{s.goals} Tore</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
