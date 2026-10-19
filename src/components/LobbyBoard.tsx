import Link from "next/link";
import { STRENGTH_LABELS } from "@/lib/labels";
import { formatDateTime } from "@/lib/time";
import type { BoardEntry, BoardMatch, BoardPlayer, BoardSearch, BoardTeam } from "@/server/board";
import { AcceptSearch } from "./AcceptSearch";
import { LightLegend, PlayerLight } from "./PlayerLight";

type Mine = { id: string; name: string; elo: number; strength: number };

const time = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });

function GameNumber({ n }: { n: number }) {
  return (
    <span className="rounded-md bg-green px-2 py-0.5 font-heading text-sm font-extrabold text-black" data-testid="game-number">
      #{n}
    </span>
  );
}

function wanted(min: number | null, max: number | null): string {
  if (min === null && max === null) return "egal";
  const lo = min ?? 1;
  const hi = max ?? 5;
  return lo === hi ? `Stufe ${lo} (${STRENGTH_LABELS[lo]})` : `Stufe ${lo} bis ${hi}`;
}

function ChallengeLink({ team, loggedIn, mine }: { team: BoardTeam; loggedIn: boolean; mine: Mine[] }) {
  const can = mine.some((m) => m.id !== team.id);
  if (!loggedIn) {
    return (
      <Link href={`/anmelden?next=${encodeURIComponent(`/app/suche/neu?gegner=${team.slug}`)}`} className="text-xs text-green underline">
        Team herausfordern
      </Link>
    );
  }
  if (!can) return null;
  return (
    <Link href={`/app/suche/neu?gegner=${team.slug}`} className="text-xs text-green underline" data-testid="challenge-link">
      Team herausfordern
    </Link>
  );
}

function TeamColumn({ team, players, ready, free, loggedIn, mine }: { team: BoardTeam; players: BoardPlayer[]; ready: number; free: number; loggedIn: boolean; mine: Mine[] }) {
  return (
    <div className="space-y-2" data-testid="board-team">
      <div>
        <Link href={`/teams/${team.slug}`} className="font-semibold hover:text-green">
          {team.name}
        </Link>
        {team.verified && <span className="ml-2 rounded bg-green-soft px-1 py-0.5 text-[10px] text-green">Verifiziert</span>}
        <p className="text-xs text-muted">
          Elo {team.elo}
          {team.playedMatches === 0 ? " (geschätzt)" : ""} · Stärke {team.strength}/5 · {team.members} im Kader
        </p>
        <ChallengeLink team={team} loggedIn={loggedIn} mine={mine} />
      </div>
      {players.length === 0 ? (
        <p className="text-xs text-muted">Noch niemand in der Lobby.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {players.map((p) => (
            <li key={p.userId} className="flex items-center justify-between gap-2" data-testid="board-player" data-light={p.light}>
              <Link href={`/spieler/${p.userId}`} className="min-w-0 truncate hover:text-green">
                {p.name}
                {p.isSubstitute && <span className="ml-1 text-xs text-muted">Ersatz</span>}
                {p.isPro && <span className="ml-1 text-[10px] text-green">Profi</span>}
              </Link>
              <PlayerLight light={p.light} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">
        {ready} von {players.length} bereit · {free > 0 ? `noch ${free} ${free === 1 ? "Platz" : "Plätze"} frei` : "voll"}
      </p>
    </div>
  );
}

function MatchCard({ m, loggedIn, mine, shareBase }: { m: BoardMatch; loggedIn: boolean; mine: Mine[]; shareBase: string }) {
  const status = m.vetoRunning ? "Hallen-Veto läuft" : m.schedulingOpen ? "Termin wird gewählt" : m.confirmed ? "Bestätigt" : "Wartet auf Spieler";
  const tone = m.confirmed ? "text-green" : "text-yellow";
  const url = `${shareBase}/lobby/${m.id}`;
  return (
    <li className="card space-y-3" data-testid="board-entry" data-kind="match">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <GameNumber n={m.number} />
          <span className={`text-sm font-semibold ${tone}`}>{status}</span>
        </span>
        <span className="text-sm text-muted">
          {m.schedulingOpen ? "Termin offen" : `${formatDateTime(m.startsAt)} Uhr`} · {m.durationMin} Min{m.venue ? ` · ${m.venue}` : ""}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TeamColumn team={m.home} players={m.homePlayers} ready={m.readyHome} free={m.freeHome} loggedIn={loggedIn} mine={mine} />
        <TeamColumn team={m.away} players={m.awayPlayers} ready={m.readyAway} free={m.freeAway} loggedIn={loggedIn} mine={mine} />
      </div>
      <div aria-label="Siegchance">
        <div className="flex h-2 overflow-hidden rounded-full bg-white/10">
          <div className="bg-green" style={{ width: `${m.winChanceHome}%` }} />
        </div>
        <p className="mt-1 text-xs text-muted" data-testid="board-win-chance">
          Siegchance nach Elo: {m.home.name} {m.winChanceHome} % · {m.away.name} {100 - m.winChanceHome} %
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/lobby/${m.id}`} className="btn btn-primary !min-h-9 !px-3 text-sm">
          Zur Lobby
        </Link>
        {m.strangers > 0 && <span className="text-xs text-muted">{m.strangers} Ersatzspieler warten auf Zuweisung</span>}
        <a href={`https://wa.me/?text=${encodeURIComponent(`Spiel #${m.number}: ${m.home.name} gegen ${m.away.name} auf Socaz ${url}`)}`} target="_blank" rel="noopener noreferrer" className="text-xs text-muted underline">
          Teilen
        </a>
      </div>
    </li>
  );
}

function SearchCard({ s, loggedIn, mine, myWaitingTeamIds, shareBase }: { s: BoardSearch; loggedIn: boolean; mine: Mine[]; myWaitingTeamIds: string[]; shareBase: string }) {
  const challenge = s.sub === "challenge";
  const own = myWaitingTeamIds.includes(s.team.id) || (challenge && mine.some((t) => t.id === s.team.id));
  const forMe = challenge && s.target ? mine.some((t) => t.id === s.target!.id) : false;
  const candidates = mine.filter((t) => t.id !== s.team.id);
  const target = s.sub === "queue" ? `${shareBase}/matchmaking#offen` : `${shareBase}/suche/${s.id}`;
  return (
    <li className="card space-y-3" data-testid="board-entry" data-kind="search">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <GameNumber n={s.number} />
          <span className="text-sm font-semibold text-yellow">{challenge ? "Herausforderung" : "Gegner gesucht"}</span>
          {own && <span className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-muted">Euer Team</span>}
        </span>
        <span className="text-sm text-muted">
          {s.startsAt ? `${formatDateTime(s.startsAt)} Uhr` : "Zeit flexibel"} · {s.durationMin} Min · {s.city}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2" data-testid="board-team">
          <div>
            <Link href={`/teams/${s.team.slug}`} className="font-semibold hover:text-green">{s.team.name}</Link>
            {s.team.verified && <span className="ml-2 rounded bg-green-soft px-1 py-0.5 text-[10px] text-green">Verifiziert</span>}
            <p className="text-xs text-muted">
              Elo {s.team.elo}
              {s.team.playedMatches === 0 ? " (geschätzt)" : ""} · Stärke {s.team.strength}/5 · {s.team.members} im Kader
            </p>
          </div>
          <ul className="space-y-1 text-sm">
            {s.roster.map((p) => (
              <li key={p.userId} className="flex items-center justify-between gap-2">
                <Link href={`/spieler/${p.userId}`} className="min-w-0 truncate hover:text-green">{p.name}</Link>
                <span className="shrink-0 text-xs text-muted">{[p.position, p.elo ? `Elo ${p.elo}` : null, p.isAdmin ? "Admin" : null].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ul>
        </div>
        {challenge && s.target ? (
          <div className="space-y-1 rounded-lg border border-dashed border-line p-3 text-sm" data-testid="challenge-target">
            <p className="text-xs text-muted">Herausgefordert wird</p>
            <Link href={`/teams/${s.target.slug}`} className="font-semibold hover:text-green">{s.target.name}</Link>
            <p className="text-xs text-muted">
              Elo {s.target.elo}
              {s.target.playedMatches === 0 ? " (geschätzt)" : ""} · Stärke {s.target.strength}/5 · {s.target.members} im Kader
            </p>
            {s.note && <p className="whitespace-pre-line text-xs">{s.note}</p>}
            <p className="text-xs text-muted">Nur das herausgeforderte Team kann annehmen.</p>
          </div>
        ) : (
        <div className="space-y-2 rounded-lg border border-dashed border-line p-3 text-sm">
          <p className="font-semibold">Gesucht wird ein Gegner</p>
          <dl className="space-y-1 text-xs">
            <div>
              <dt className="text-muted">Gesuchte Spielstärke</dt>
              <dd>{s.sub === "request" ? `${s.wantStrengthMin} von 5 (${STRENGTH_LABELS[s.wantStrengthMin ?? 3]})` : wanted(s.wantStrengthMin, s.wantStrengthMax)}</dd>
            </div>
            {s.windows.length > 0 && (
              <div>
                <dt className="text-muted">Zeitfenster</dt>
                <dd>
                  {s.windows.map((w) => (
                    <span key={w.from} className="block">
                      {formatDateTime(new Date(w.from))} bis {time(w.to)} Uhr
                    </span>
                  ))}
                </dd>
              </div>
            )}
            {s.note && (
              <div>
                <dt className="text-muted">Hinweis</dt>
                <dd className="whitespace-pre-line">{s.note}</dd>
              </div>
            )}
          </dl>
          <p className="text-xs text-muted">Sucht seit {formatDateTime(s.createdAt)} Uhr</p>
        </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {forMe && (
          <Link href={`/suche/${s.id}`} className="btn btn-primary !min-h-9 !px-3 text-sm" data-testid="accept-challenge">
            Herausforderung annehmen
          </Link>
        )}
        {challenge && !forMe && !own && <Link href={`/suche/${s.id}`} className="text-xs text-green underline">Details</Link>}
        {!loggedIn && !challenge && (
          <Link href={`/anmelden?next=${encodeURIComponent(s.sub === "queue" ? "/matchmaking#offen" : `/suche/${s.id}`)}`} className="btn btn-primary !min-h-9 !px-3 text-sm">
            Anmelden und Team herausfordern
          </Link>
        )}
        {loggedIn && !own && s.sub === "request" && candidates.length > 0 && (
          <Link href={`/suche/${s.id}`} className="btn btn-primary !min-h-9 !px-3 text-sm">
            Team herausfordern
          </Link>
        )}
        {loggedIn && !own && !challenge && candidates.length === 0 && <span className="text-xs text-muted">Um anzutreten, brauchst du ein Team, bei dem du Admin bist.</span>}
        <a href={`https://wa.me/?text=${encodeURIComponent(`Spiel #${s.number}: ${s.team.name} ${challenge && s.target ? `fordert ${s.target.name} heraus` : "sucht einen Gegner"} auf Socaz ${target}`)}`} target="_blank" rel="noopener noreferrer" className="text-xs text-muted underline">
          Teilen
        </a>
      </div>
      {loggedIn && !own && s.sub === "queue" && candidates.length > 0 && (
        <AcceptSearch entryId={s.id} teams={candidates} opponent={{ name: s.team.name, elo: s.team.elo, wantMin: s.wantStrengthMin, wantMax: s.wantStrengthMax }} label="Team herausfordern" />
      )}
    </li>
  );
}

/** Öffentliche Übersicht aller offenen Lobbys und Suchen mit Spielnummer, Stärke, Spielern und Ampel. */
export function LobbyBoard({ entries, mine, myWaitingTeamIds, loggedIn, shareBase, paymentsOn }: { entries: BoardEntry[]; mine: Mine[]; myWaitingTeamIds: string[]; loggedIn: boolean; shareBase: string; paymentsOn: boolean }) {
  if (entries.length === 0) {
    return (
      <p className="card text-sm text-muted" data-testid="board-empty">
        Gerade ist keine Lobby offen. Stell dein Team ins Matchmaking oder lege eine Spielsuche an, dann erscheint sie hier für alle.
      </p>
    );
  }
  return (
    <div className="space-y-3" data-testid="lobby-board">
      <LightLegend paymentsOn={paymentsOn} />
      <ul className="space-y-3">
        {entries.map((e) =>
          e.kind === "match" ? (
            <MatchCard key={`m-${e.id}`} m={e} loggedIn={loggedIn} mine={mine} shareBase={shareBase} />
          ) : (
            <SearchCard key={`${e.sub}-${e.id}`} s={e} loggedIn={loggedIn} mine={mine} myWaitingTeamIds={myWaitingTeamIds} shareBase={shareBase} />
          ),
        )}
      </ul>
    </div>
  );
}
