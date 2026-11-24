import { formatDateTime } from "@/lib/time";
import { LinkButton } from "@/components/ui/LinkButton";
import { myCurrent } from "@/server/mygame";
import { colorByKey } from "@/lib/team-color";

/** Kleine Farbmarke vor dem Teamnamen; ohne Teamfarbe (Privatspiel) keine Marke. */
function Mark({ k }: { k: string | null }) {
  const c = colorByKey(k);
  return c ? <span aria-hidden="true" data-testid="game-color-mark" data-color={c.key} className="mr-1 inline-block size-3 rounded-full border border-line align-middle" style={{ backgroundColor: c.hex }} /> : null;
}

/** Ganz oben und auffällig: das eigene aktuelle Spiel und die eigenen offenen Lobbys, getrennt von der Liste aller offenen Lobbys. */
export async function MyGames({ userId, data }: { userId: string; data?: Awaited<ReturnType<typeof myCurrent>> }) {
  const { games, open } = data ?? (await myCurrent(userId)); // /app lädt die Daten selbst (auch für „Dein Stand“) und reicht sie weiter
  if (games.length === 0 && open.length === 0) return null;
  return (
    <section className="space-y-3 rounded-2xl border-2 border-accent bg-accent-soft p-4" aria-label="Mein aktuelles Spiel" data-testid="my-games">
      <h2 className="text-lg font-bold text-accent-fg">{games.length + open.length > 1 ? "Meine aktuellen Spiele" : "Mein aktuelles Spiel"}</h2>
      <ul className="space-y-2">
        {games.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-panel p-3" data-testid="my-game">
            <span>
              <span className="mr-2 rounded-md bg-accent px-2 py-0.5 font-heading text-sm font-extrabold text-accent-ink">#{g.number}</span>
              <span className="font-semibold"><Mark k={g.homeColor} />{g.home} VS. <Mark k={g.awayColor} />{g.away}</span>
              <span className="block text-sm text-muted">{g.timeOpen ? "Uhrzeit noch offen" : `${formatDateTime(g.startsAt)} Uhr`}</span>
              <span className="block text-sm font-semibold text-ink">{g.phase}</span>
            </span>
            <LinkButton href={`/lobby/${g.id}`} size="sm">Zur Lobby</LinkButton>
          </li>
        ))}
        {open.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-panel p-3" data-testid="my-open-lobby">
            <span>
              <span className="mr-2 rounded-md bg-accent px-2 py-0.5 font-heading text-sm font-extrabold text-accent-ink">#{o.number}</span>
              <span className="font-semibold">{o.team}</span>
              <span className="block text-sm text-muted">
                {o.windows.map((w) => `${formatDateTime(new Date(w.from))} bis ${new Date(w.to).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" })} Uhr`).join(" · ")} · {o.durationMin} Min
              </span>
              <span className="block text-sm font-semibold text-ink">Eure Lobby ist offen und wartet auf einen Gegner</span>
            </span>
            <LinkButton href={`/lobby/offen/${o.id}`} size="sm">Zur Lobby</LinkButton>
          </li>
        ))}
      </ul>
    </section>
  );
}
