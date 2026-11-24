import type { Metadata } from "next";
import Link from "next/link";
import { LiveIndicator } from "@/components/LiveIndicator";
import { BoardSection } from "@/components/BoardSection";
import { MyGames } from "@/components/MyGames";
import { Challenges } from "@/components/Challenges";
import { SPIELART_TEXT } from "@/lib/spielarten-texte";
import { CITIES, filterSchema } from "@/lib/validation";
import { myChallenges } from "@/server/requests";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = { title: "Offene Lobbys" };

export default async function SearchPage({ searchParams }: PageProps<"/suche">) {
  const raw = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const filter = filterSchema.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, one(v)])));
  const kind = one(raw.art) === "lobby" ? "match" : one(raw.art) === "suche" ? "search" : undefined;
  const active = Object.values(filter).some((v) => v !== undefined) || kind !== undefined;
  const user = await getCurrentUser();
  const challenges = user?.onboardedAt ? await myChallenges(user.id) : { incoming: [], outgoing: [] };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Offene Lobbys anderer Teams <LiveIndicator eventsUrl="/api/spiele/stream" /></h1>
        <p className="text-sm text-muted">Alles öffentlich: Wer spielt gegen wen, wer sucht einen Gegner, wer ist schon in der Lobby. Jedes Spiel hat eine Nummer.</p>
      </div>

      {/* Auswahlschritt "Spiel suchen" (013 M3, Entscheid t2q): Teamspiel, Privatspiel oder Turnier, ohne neue URL. Genau eine Hauptaktion (Lobby aufmachen), die anderen Wege ruhig. */}
      <section aria-labelledby="modes-h" className="card space-y-3" data-testid="search-modes">
        <h2 id="modes-h" className="text-lg font-semibold">Was möchtest du spielen?</h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          <li className="space-y-2" data-testid="search-mode-team">
            <h3 className="font-semibold">{SPIELART_TEXT.team.title}</h3>
            <p className="text-sm text-muted">{SPIELART_TEXT.team.text}</p>
            <Link href="/matchmaking" className="btn btn-primary">Lobby aufmachen</Link>
          </li>
          <li className="space-y-2" data-testid="search-mode-private">
            <h3 className="font-semibold">{SPIELART_TEXT.private.title}</h3>
            <p className="text-sm text-muted">{SPIELART_TEXT.private.text}</p>
            <Link href={user ? "/app/privatspiel/neu" : "/anmelden?next=/app/privatspiel/neu"} className="btn btn-ghost">Privatspiel anlegen</Link>
          </li>
          <li className="space-y-2" data-testid="search-mode-tournament">
            <h3 className="font-semibold">{SPIELART_TEXT.tournament.title}</h3>
            <p className="text-sm text-muted">{SPIELART_TEXT.tournament.text}</p>
            <Link href="/turniere" className="btn btn-ghost">Turniere ansehen</Link>
          </li>
        </ul>
      </section>

      {user?.onboardedAt && <MyGames userId={user.id} />}

      <Challenges incoming={challenges.incoming} outgoing={challenges.outgoing} />

      <form className="card grid grid-cols-2 gap-3 sm:grid-cols-3" method="get" aria-label="Lobbys filtern">
        <div>
          <label className="label" htmlFor="city">Stadt</label>
          <select id="city" name="city" defaultValue={filter.city ?? ""} className="field">
            <option value="">Alle</option>
            {CITIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="date">Datum</label>
          <input id="date" name="date" type="date" defaultValue={filter.date ?? ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="durationMin">Dauer</label>
          <select id="durationMin" name="durationMin" defaultValue={filter.durationMin ?? ""} className="field">
            <option value="">Alle</option>
            <option value="60">60 Min</option>
            <option value="90">90 Min</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="art">Art</label>
          <select id="art" name="art" defaultValue={one(raw.art) ?? ""} className="field">
            <option value="">Lobbys und Suchen</option>
            <option value="lobby">Nur Lobbys (Gegner gefunden)</option>
            <option value="suche">Nur Gegnersuchen</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="minStrength">Stärke ab</label>
          <select id="minStrength" name="minStrength" defaultValue={filter.minStrength ?? ""} className="field">
            <option value="">–</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="maxStrength">bis</label>
          <select id="maxStrength" name="maxStrength" defaultValue={filter.maxStrength ?? ""} className="field">
            <option value="">–</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2 flex gap-2 sm:col-span-3">
          <button className="btn btn-ghost flex-1">Filtern</button>
          {active && <Link href="/suche" className="btn btn-ghost">Zurücksetzen</Link>}
        </div>
      </form>

      <BoardSection filter={{ ...filter, kind }} />
    </div>
  );
}
