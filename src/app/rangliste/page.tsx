import type { Metadata } from "next";
import Link from "next/link";
import { berlinMonthRange } from "@/lib/time";
import { CITIES } from "@/lib/validation";
import { leaderboards } from "@/server/profiles";

export const metadata: Metadata = { title: "Rangliste" };

export default async function RankingPage({ searchParams }: PageProps<"/rangliste">) {
  const sp = await searchParams;
  const city = typeof sp.city === "string" && (CITIES as readonly string[]).includes(sp.city) ? sp.city : undefined;
  const range = berlinMonthRange(typeof sp.monat === "string" ? sp.monat : undefined);
  const data = await leaderboards({ city, monthStart: range.from, monthEnd: range.to });

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold">Rangliste</h1>
        <form className="flex flex-wrap gap-2">
          <select name="city" defaultValue={city ?? ""} aria-label="Stadt" className="field !w-auto">
            <option value="">Ganz NRW</option>
            {CITIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input type="month" name="monat" defaultValue={range.month} aria-label="Monat" className="field !w-auto" />
          <button className="btn btn-primary">Anzeigen</button>
        </form>
      </header>

      <section className="space-y-2" aria-labelledby="monat-h">
        <h2 id="monat-h" className="text-lg font-semibold">
          Teams im {range.label}
        </h2>
        {data.monthly.length === 0 ? (
          <p className="text-sm text-muted">In diesem Monat wurden noch keine Spiele gewertet.</p>
        ) : (
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
                {data.monthly.map((t, i) => (
                  <tr key={t.id} className="border-t border-line">
                    <td className="p-2">{i + 1}</td>
                    <td>
                      <Link href={`/teams/${t.slug}`} className="font-semibold hover:text-green">
                        {t.name}
                      </Link>
                      <span className="block text-xs text-muted">{t.city}</span>
                    </td>
                    <td>{t.played}</td>
                    <td>
                      {t.wins}-{t.draws}-{t.losses}
                    </td>
                    <td>
                      {t.gf} ({t.gd > 0 ? "+" : ""}
                      {t.gd})
                    </td>
                    <td className="pr-3 text-right font-bold">{t.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="elo-h">
        <h2 id="elo-h" className="text-lg font-semibold">
          Stärkste Teams (Elo)
        </h2>
        <p className="text-xs text-muted">Ab 5 gespielten Spielen. Siege gegen stärkere Gegner zählen mehr.</p>
        {data.teamElo.length === 0 ? (
          <p className="text-sm text-muted">Noch kein Team hat 5 Spiele.</p>
        ) : (
          <ol className="space-y-2">
            {data.teamElo.map((t, i) => (
              <li key={t.id} className="card flex items-center justify-between">
                <span>
                  <span className="mr-2 text-muted">{i + 1}.</span>
                  <Link href={`/teams/${t.slug}`} className="font-semibold hover:text-green">
                    {t.name}
                  </Link>{" "}
                  <span className="text-xs text-muted">{t.city}</span>
                </span>
                <span className="font-bold">{t.elo}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="tor-h">
        <h2 id="tor-h" className="text-lg font-semibold">
          Torjäger
        </h2>
        {data.scorers.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Tore.</p>
        ) : (
          <ol className="space-y-2">
            {data.scorers.map((p, i) => (
              <li key={p.id} className="card flex items-center justify-between">
                <span>
                  <span className="mr-2 text-muted">{i + 1}.</span>
                  <Link href={`/spieler/${p.id}`} className="font-semibold hover:text-green">
                    {p.name}
                  </Link>
                </span>
                <span className="font-bold">
                  {p.goals} <span className="text-xs font-normal text-muted">in {p.matches} Spielen</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="pelo-h">
        <h2 id="pelo-h" className="text-lg font-semibold">
          Beste Spieler (Elo)
        </h2>
        {data.playerElo.length === 0 ? (
          <p className="text-sm text-muted">Noch kein Spieler hat 5 Spiele.</p>
        ) : (
          <ol className="space-y-2">
            {data.playerElo.map((p, i) => (
              <li key={p.id} className="card flex items-center justify-between">
                <span>
                  <span className="mr-2 text-muted">{i + 1}.</span>
                  <Link href={`/spieler/${p.id}`} className="font-semibold hover:text-green">
                    {p.name}
                  </Link>
                </span>
                <span className="font-bold">{p.elo}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
