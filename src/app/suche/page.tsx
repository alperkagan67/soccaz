import type { Metadata } from "next";
import Link from "next/link";
import { CITIES, filterSchema } from "@/lib/validation";
import { formatDateTime } from "@/lib/time";
import { strengthText } from "@/lib/labels";
import { Challenges } from "@/components/Challenges";
import { OpenSearches } from "@/components/OpenSearches";
import { listOpenSearches, teamElo } from "@/server/matchmaking";
import { listOpenRequests, myAdminTeams, myChallenges } from "@/server/requests";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = { title: "Spielsuchen" };

export default async function SearchPage({ searchParams }: PageProps<"/suche">) {
  const raw = await searchParams;
  const filter = filterSchema.parse(
    Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
  );
  const results = await listOpenRequests(filter);
  const active = Object.values(filter).some((v) => v !== undefined);
  const user = await getCurrentUser();
  const adminTeams = user?.onboardedAt ? await myAdminTeams(user.id) : [];
  const challenges = user?.onboardedAt ? await myChallenges(user.id) : { incoming: [], outgoing: [] };
  const searches = await listOpenSearches({ city: filter.city, durationMin: filter.durationMin });
  const mine = await Promise.all(adminTeams.map(async (t) => ({ id: t.id, name: t.name, elo: await teamElo(t.id), strength: t.strength })));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Spielsuchen</h1>
        <Link href="/app/suche/neu" className="btn btn-primary !min-h-9">Gegner suchen</Link>
      </div>

      <Challenges incoming={challenges.incoming} outgoing={challenges.outgoing} />

      <form className="card grid grid-cols-2 gap-3" method="get">
        <div className="col-span-2 sm:col-span-1">
          <label className="label" htmlFor="city">Stadt</label>
          <select id="city" name="city" defaultValue={filter.city ?? ""} className="field">
            <option value="">Alle</option>
            {CITIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
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
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="minStrength">Stärke ab</label>
            <select id="minStrength" name="minStrength" defaultValue={filter.minStrength ?? ""} className="field">
              <option value="">–</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="maxStrength">bis</label>
            <select id="maxStrength" name="maxStrength" defaultValue={filter.maxStrength ?? ""} className="field">
              <option value="">–</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <div className="col-span-2 flex gap-2">
          <button className="btn btn-primary flex-1">Filtern</button>
          {active && <Link href="/suche" className="btn btn-ghost">Zurücksetzen</Link>}
        </div>
      </form>

      <section className="space-y-3" aria-labelledby="flex-h" data-testid="flex-searches">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="flex-h" className="text-lg font-semibold">Teams mit flexibler Zeit ({searches.length})</h2>
          <Link href="/matchmaking" className="text-sm text-green underline">Zum Matchmaking</Link>
        </div>
        <p className="text-sm text-muted">Diese Teams haben Zeitfenster angegeben und warten im Matchmaking. Ihr könnt direkt gegen sie antreten.</p>
        <OpenSearches searches={searches} mine={mine} myWaitingTeamIds={[]} />
      </section>

      <h2 className="text-lg font-semibold">Spielsuchen mit festem Termin ({results.length})</h2>
      {results.length === 0 ? (
        <p className="card text-muted">
          {active ? "Keine Spielsuche passt zu deinen Filtern." : "Noch keine offenen Spielsuchen. Erstelle die erste."}
        </p>
      ) : (
        <ul className="space-y-2">
          {results.map((r) => (
            <li key={r.id}>
              <Link href={`/suche/${r.id}`} className="card block hover:border-green">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">{r.teamName}</span>
                  <span className="text-sm text-green">{r.durationMin} Min</span>
                </span>
                <span className="block text-sm text-muted">{formatDateTime(r.startsAt)} Uhr · {r.city}</span>
                <span className="block text-xs text-muted">Gesucht: Stärke {strengthText(r.strength)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
