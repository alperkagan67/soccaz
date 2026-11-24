import type { Metadata } from "next";
import Link from "next/link";
import { Challenges } from "@/components/Challenges";
import { GameModes } from "@/components/GameModes";
import { TeamColorDot } from "@/components/TeamColor";
import { LinkButton } from "@/components/ui/LinkButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { StateMessage } from "@/components/ui/StateMessage";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { dashboardStand, groupByKind, matchBadge, matchHref } from "@/lib/my-games";
import { formatDateTime } from "@/lib/time";
import { myMatches } from "@/server/lobby";
import { myCurrent } from "@/server/mygame";
import { myChargeFailures } from "@/server/my-games";
import { myChallenges } from "@/server/requests";
import { requireUser } from "@/server/session";
import { listMyTeams } from "@/server/teams";

export const metadata: Metadata = { title: "Meine Spiele" };

// 013 M3 PR 4: „Meine Spiele“ (/app). Reihenfolge: Dein Stand mit der EINEN Hauptaktion im Seitenkopf, Fehlerzustand (eigene fehlgeschlagene Abbuchung), aktuelle Spiele, Herausforderungen,
// Meine Spiele nach Spielart gruppiert (Zeile mit Zustandswort), Meine Teams. Kein Kontostand (AC-14). Alle Test-IDs bleiben (AC-5).
export default async function DashboardPage() {
  const user = await requireUser("/app");
  const [myTeams, games, challenges, current, failures] = await Promise.all([listMyTeams(user.id), myMatches(user.id), myChallenges(user.id), myCurrent(user.id), myChargeFailures(user.id)]);
  const now = new Date();
  const stand = dashboardStand({ games: current.games, open: current.open, teamCount: myTeams.length, incoming: challenges.incoming }, formatDateTime);
  const groups = groupByKind(games, now);
  const firstName = user.name.split(" ")[0];

  return (
    <PageShell width="narrow">
      <PageHeader
        title={`Hey ${firstName}`}
        meta={`${user.position} · ${user.city}`}
        stand={
          <>
            <p className="font-semibold">{stand.line}</p>
            {stand.detail && <p className="text-muted">{stand.detail}</p>}
          </>
        }
        action={stand.action}
      />

      {failures.length > 0 && (
        <div data-testid="charge-failed-self">
          <StateMessage
            kind="error"
            title="Abbuchung fehlgeschlagen"
            reason={`Für dein Spiel #${failures[0].number}${failures.length > 1 ? ` und ${failures.length - 1} weitere` : ""} konnte deine Karte nicht belastet werden: ändere die Karte oder gib die Zahlung bei deiner Bank frei.`}
            action={{ label: "Karte in der Lobby ändern", href: `/lobby/${failures[0].matchId}` }}
          />
        </div>
      )}

      <Challenges incoming={challenges.incoming} outgoing={challenges.outgoing} />

      {myTeams.length === 0 && games.length === 0 && (
        <section className="card space-y-3" aria-label="So startest du" data-testid="first-steps">
          <h2 className="font-semibold">So startest du</h2>
          <ol className="space-y-2 text-sm text-muted">
            <li><strong className="text-ink">1. Team gründen</strong> oder den Einladungslink deines Teams öffnen.</li>
            <li><strong className="text-ink">2. Mitspieler einladen</strong> (Link per WhatsApp).</li>
            <li><strong className="text-ink">3. Lobby aufmachen</strong> und auf ein Team warten, das antritt.</li>
          </ol>
          <LinkButton href="/hilfe">Wie funktioniert das?</LinkButton>
        </section>
      )}

      <section className="space-y-4" aria-label="Meine Spiele" data-testid="my-matches">
        <h2 className="text-lg font-semibold">Meine Spiele</h2>
        {current.open.length > 0 && (
          <div className="space-y-2" data-testid="my-matches-open">
            <h3 className="text-sm font-semibold text-muted">Offene Lobbys deiner Teams</h3>
            <ul className="space-y-2">
              {current.open.map((o) => (
                <li key={o.id}>
                  <Link href={`/lobby/offen/${o.id}`} className="card flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-2 hover:border-accent" data-testid="my-open-lobby">
                    <span className="min-w-0 flex-1 basis-48">
                      <span className="block truncate font-semibold">#{o.number} {o.team}</span>
                      <span className="block text-sm text-muted">Eure Lobby ist offen und wartet auf einen Gegner</span>
                    </span>
                    <StatusBadge status="info" label="Offen" viewer="self" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {groups.length === 0 && current.open.length === 0 ? (
          <StateMessage kind="empty" title="Noch keine Spiele" reason="Such einen Gegner oder nimm eine Spielsuche an." action={{ label: "Spiel suchen", href: "/suche" }} />
        ) : (
          groups.map((group) => (
            <div key={group.kind} className="space-y-2" data-testid={`my-matches-${group.kind}`}>
              <h3 className="text-sm font-semibold text-muted">{group.label}</h3>
              <ul className="space-y-2">
                {group.rows.map((g) => {
                  const badge = matchBadge(g, now);
                  return (
                    <li key={g.id}>
                      <Link href={matchHref(g, now)} className="card flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-2 hover:border-accent" data-testid="my-match-row">
                        <span className="min-w-0 flex-1 basis-48">
                          <span className="block truncate font-semibold">{g.homeName} <span className="text-muted">gegen</span> {g.awayName}</span>
                          <span className="block text-sm text-muted">{formatDateTime(g.startsAt)} Uhr · {g.durationMin} Min</span>
                        </span>
                        <StatusBadge status={badge.tone} label={badge.label} viewer="self" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Meine Teams</h2>
          <LinkButton href="/app/teams/neu" size="sm">Team gründen</LinkButton>
        </div>
        {myTeams.length === 0 ? (
          <p className="card text-muted">Du bist noch in keinem Team. Gründe eins oder öffne einen Einladungslink, den dir ein Team-Admin schickt.</p>
        ) : (
          <ul className="space-y-2">
            {myTeams.map((t) => (
              <li key={t.id}>
                <Link href={`/teams/${t.slug}`} className="card flex min-h-11 items-center justify-between hover:border-accent">
                  <span>
                    <span className="font-semibold"><TeamColorDot color={t.color} slug={t.slug} className="mr-2" />{t.name}</span>
                    <span className="block text-sm text-muted">{t.city}</span>
                  </span>
                  <span className="text-sm text-muted">{t.role === "admin" ? "Team-Admin" : "Spieler"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <GameModes signedIn quiet />

      <nav aria-label="Schnellzugriff" className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <Link href={`/spieler/${user.id}`} className="card flex min-h-11 items-center justify-center text-center hover:border-accent">Mein Profil</Link>
        <Link href="/rangliste" className="card flex min-h-11 items-center justify-center text-center hover:border-accent">Rangliste</Link>
        <Link href="/app/einstellungen" className="card flex min-h-11 items-center justify-center text-center hover:border-accent">Einstellungen</Link>
        <Link href="/hilfe" className="card flex min-h-11 items-center justify-center text-center hover:border-accent">Hilfe</Link>
      </nav>
    </PageShell>
  );
}
