import Link from "next/link";
import { guestRosterView } from "@/lib/guest-roster";
import { personLabel, type LobbySicht } from "@/lib/lobby-namen";

// 013 M3 PR 5a (AC-17): Teilnehmer-Name und Rest-Kader der Lobby je Sicht. Reine Darstellung ohne Datenbank (renderToStaticMarkup-Test je Rolle).
// Mitglied: Name, Link und Daten. Gast: Anzahl und Initialen. Reiner Hallenbetreiber: nur die Anzahl, keine Namen, Initialen, Links, Positionen oder Elo (Vertrag 012 AC-12, 013 Sichtbarkeitsmatrix).
export type RosterRow = { userId: string; name: string; position: string | null; elo: number | null; isAdmin: boolean };

export function ParticipantName({ name, sicht, index }: { name: string; sicht: LobbySicht; index: number }) {
  return <span data-testid="participant-name" data-sicht={sicht}>{personLabel(name, sicht, index)}</span>;
}

export function LobbyRoster({ teamSlug, members, sicht }: { teamSlug: string; members: RosterRow[]; sicht: LobbySicht }) {
  if (members.length === 0) return null;
  if (sicht === "hall") {
    return (
      <div className="border-t border-line pt-2" data-testid={`roster-${teamSlug}`}>
        <p className="text-sm text-muted">Weitere Teammitglieder (noch nicht in der Lobby): {members.length}</p>
      </div>
    );
  }
  if (sicht === "guest") {
    const g = guestRosterView(members);
    return (
      <div className="border-t border-line pt-2" data-testid={`roster-${teamSlug}`}>
        <p className="text-sm text-muted">Weitere Teammitglieder (noch nicht in der Lobby): {g.count} · {g.initials.join(" ")}</p>
      </div>
    );
  }
  return (
    <div className="border-t border-line pt-2" data-testid={`roster-${teamSlug}`}>
      <p className="mb-1 text-sm text-muted">Weitere Teammitglieder (noch nicht in der Lobby)</p>
      <ul className="space-y-1 text-sm text-muted">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-2">
            <Link href={`/spieler/${m.userId}`} className="hover:text-accent-fg">{m.name}</Link>
            <span className="text-sm">{[m.position, m.elo ? `Elo ${m.elo}` : null, m.isAdmin ? "Admin" : null].filter(Boolean).join(" · ")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
