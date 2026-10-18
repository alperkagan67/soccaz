import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { formatEuro } from "@/lib/money";
import { cancelTournamentAction, startTournamentAction, withdrawTeamAction } from "@/server/tournament-actions";
import { myAdminTeams } from "@/server/requests";
import { getCurrentUser } from "@/server/session";
import { getTournament } from "@/server/tournaments";
import { RegisterForm } from "./RegisterForm";
import { ResultForm } from "./ResultForm";

export async function generateMetadata({ params }: PageProps<"/turniere/[id]">): Promise<Metadata> {
  const { id } = await params;
  const data = await getTournament(id);
  return { title: data ? data.tournament.name : "Turnier nicht gefunden" };
}

const FORMAT = { round_robin: "Jeder gegen jeden", knockout: "K.-o.-System", groups_ko: "Gruppen und K.-o.-Runde" } as const;
const STATUS = { registration: "Anmeldung offen", running: "Läuft", finished: "Beendet", cancelled: "Abgesagt" } as const;

const stageLabel = (stage: string) => {
  if (stage === "round") return "Spielplan";
  if (stage.startsWith("group:")) return `Gruppe ${stage.slice(6)}`;
  const n = Number(stage.slice(3));
  return n === 2 ? "Finale" : n === 4 ? "Halbfinale" : n === 8 ? "Viertelfinale" : `Runde der letzten ${n}`;
};

export default async function TournamentPage({ params }: PageProps<"/turniere/[id]">) {
  const { id } = await params;
  const data = await getTournament(id);
  if (!data) notFound();
  const { tournament: t, entries } = data;
  const user = await getCurrentUser();
  const mine = user?.onboardedAt ? await myAdminTeams(user.id) : [];
  const entered = new Set(entries.map((e) => e.teamId));
  const manage = Boolean(user && (user.id === t.organizerId || user.role === "admin"));
  const joinable = t.status === "registration" && entries.length < t.maxTeams ? mine.filter((x) => !entered.has(x.id)) : [];

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">{t.name}</h1>
        <p className="text-muted">
          {t.city}
          {t.venueText ? ` · ${t.venueText}` : ""} · {t.startsOn} · {FORMAT[t.format]}
        </p>
        <p className="text-sm text-muted">
          Veranstalter: {data.organizerName} · {STATUS[t.status]} · {entries.length}/{t.maxTeams} Teams · Startgeld {t.entryFeeCents > 0 ? formatEuro(t.entryFeeCents) : "kostenlos"}
        </p>
        {data.winner && (
          <p className="text-green" data-testid="winner">
            Turniersieger: <span className="font-semibold">{data.winner}</span>
          </p>
        )}
      </header>

      {t.status === "registration" && !user && (
        <Link href={`/anmelden?next=${encodeURIComponent(`/turniere/${t.id}`)}`} className="btn btn-primary w-full">Anmelden und Team anmelden</Link>
      )}
      {joinable.length > 0 && <RegisterForm tournamentId={t.id} teams={joinable.map((x) => ({ id: x.id, name: x.name }))} fee={t.entryFeeCents} />}

      {manage && (t.status === "registration" || t.status === "running") && (
        <section className="card flex flex-wrap gap-2">
          {t.status === "registration" && <ActionButton action={startTournamentAction.bind(null, t.id)} label="Turnier starten" confirm="Turnier starten? Die Anmeldung wird geschlossen und der Spielplan festgelegt." className="btn btn-primary !min-h-9 !px-3 text-sm" />}
          <ActionButton action={cancelTournamentAction.bind(null, t.id)} label="Turnier absagen" confirm="Turnier absagen? Alle Startgelder werden erstattet." className="btn btn-danger !min-h-9 !px-3 text-sm" />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Teams ({entries.length})</h2>
        {entries.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Anmeldung.</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((e) => (
              <li key={e.teamId} className="card flex items-center justify-between gap-2">
                <Link href={`/teams/${e.slug}`} className="font-semibold hover:text-green">{e.name}</Link>
                {t.status === "registration" && mine.some((x) => x.id === e.teamId) && <ActionButton action={withdrawTeamAction.bind(null, t.id, e.teamId)} label="Abmelden" confirm="Euer Team abmelden? Das Startgeld wird erstattet." />}
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.tables.map((table) => (
        <section key={table.name} className="space-y-2">
          <h2 className="text-lg font-semibold">{table.name}</h2>
          <div className="card overflow-x-auto !p-0">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="p-2">#</th>
                  <th>Team</th>
                  <th>Sp</th>
                  <th>S-U-N</th>
                  <th>Tore</th>
                  <th className="pr-3 text-right">Pkt</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={r.teamId} className="border-t border-line">
                    <td className="p-2">{i + 1}</td>
                    <td>{r.name}</td>
                    <td>{r.played}</td>
                    <td>{r.wins}-{r.draws}-{r.losses}</td>
                    <td>{r.gf}:{r.ga}</td>
                    <td className="pr-3 text-right font-bold">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {data.stages.map((stage) => (
        <section key={stage.stage} className="space-y-2">
          <h2 className="text-lg font-semibold">{stageLabel(stage.stage)}</h2>
          <ul className="space-y-2">
            {stage.matches.map((m) => {
              const done = m.scoreA !== null && m.scoreB !== null;
              return (
                <li key={m.id} className="card space-y-2" data-testid="tournament-match">
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                    <span className="text-right font-semibold">{m.nameA ?? "offen"}</span>
                    <span className="font-heading text-lg tabular-nums">{done ? `${m.scoreA} : ${m.scoreB}` : "–"}</span>
                    <span className="font-semibold">{m.nameB ?? "offen"}</span>
                  </div>
                  {m.shootoutWinner && <p className="text-center text-xs text-muted">Sieger im Siebenmeterschießen: {m.shootoutWinner === m.teamA ? m.nameA : m.nameB}</p>}
                  {manage && t.status === "running" && m.teamA && m.teamB && (
                    <ResultForm tournamentId={t.id} matchId={m.id} ko={m.stage.startsWith("ko:")} a={{ id: m.teamA, name: m.nameA ?? "" }} b={{ id: m.teamB, name: m.nameB ?? "" }} current={done ? { a: m.scoreA!, b: m.scoreB! } : null} />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
