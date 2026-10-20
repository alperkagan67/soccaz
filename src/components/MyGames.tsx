import Link from "next/link";
import { formatDateTime } from "@/lib/time";
import { myCurrent } from "@/server/mygame";

/** Ganz oben und auffällig: das eigene aktuelle Spiel und die eigenen offenen Lobbys, getrennt von der Liste aller offenen Lobbys. */
export async function MyGames({ userId }: { userId: string }) {
  const { games, open } = await myCurrent(userId);
  if (games.length === 0 && open.length === 0) return null;
  return (
    <section className="space-y-3 rounded-2xl border-2 border-green bg-green-soft p-4" aria-label="Mein aktuelles Spiel" data-testid="my-games">
      <h2 className="text-lg font-bold text-green">{games.length + open.length > 1 ? "Meine aktuellen Spiele" : "Mein aktuelles Spiel"}</h2>
      <ul className="space-y-2">
        {games.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-panel p-3" data-testid="my-game">
            <span>
              <span className="mr-2 rounded-md bg-green px-2 py-0.5 font-heading text-sm font-extrabold text-black">#{g.number}</span>
              <span className="font-semibold">{g.home} VS. {g.away}</span>
              <span className="block text-sm text-muted">{g.timeOpen ? "Uhrzeit noch offen" : `${formatDateTime(g.startsAt)} Uhr`}</span>
              <span className="block text-sm font-semibold text-yellow">{g.phase}</span>
            </span>
            <Link href={`/lobby/${g.id}`} className="btn btn-primary !min-h-9 !px-4 text-sm">Zur Lobby</Link>
          </li>
        ))}
        {open.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-panel p-3" data-testid="my-open-lobby">
            <span>
              <span className="mr-2 rounded-md bg-green px-2 py-0.5 font-heading text-sm font-extrabold text-black">#{o.number}</span>
              <span className="font-semibold">{o.team}</span>
              <span className="block text-sm text-muted">
                {o.windows.map((w) => `${formatDateTime(new Date(w.from))} bis ${new Date(w.to).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" })} Uhr`).join(" · ")} · {o.durationMin} Min
              </span>
              <span className="block text-sm font-semibold text-yellow">Eure Lobby ist offen und wartet auf einen Gegner</span>
            </span>
            <Link href="/matchmaking" className="btn btn-ghost !min-h-9 !px-4 text-sm">Verwalten</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
