import type { Metadata } from "next";
import Link from "next/link";
import { formatEuro } from "@/lib/money";
import { CITIES } from "@/lib/validation";
import { getCurrentUser } from "@/server/session";
import { listTournaments } from "@/server/tournaments";

export const metadata: Metadata = { title: "Turniere" };

const FORMAT = { round_robin: "Jeder gegen jeden", knockout: "K.-o.-System", groups_ko: "Gruppen und K.-o.-Runde" } as const;
const STATUS = { registration: "Anmeldung offen", running: "Läuft", finished: "Beendet", cancelled: "Abgesagt" } as const;

export default async function TournamentsPage({ searchParams }: PageProps<"/turniere">) {
  const sp = await searchParams;
  const city = typeof sp.city === "string" && (CITIES as readonly string[]).includes(sp.city) ? sp.city : undefined;
  const [list, user] = await Promise.all([listTournaments({ city }), getCurrentUser()]);
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Turniere</h1>
        <p className="text-muted">Turniere von freigeschalteten Veranstaltern. Das Startgeld zahlst du bei der Anmeldung vom Guthaben.</p>
      </header>
      <form className="flex gap-2">
        <select name="city" defaultValue={city ?? ""} aria-label="Stadt" className="field !w-auto flex-1">
          <option value="">Alle Städte</option>
          {CITIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button className="btn btn-primary">Anzeigen</button>
      </form>
      {user?.onboardedAt && (
        <Link href="/app/turniere/neu" className="btn btn-ghost w-full">
          Eigenes Turnier anlegen
        </Link>
      )}
      {list.length === 0 ? (
        <p className="card text-muted">Aktuell sind keine Turniere eingetragen.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((t) => (
            <li key={t.id}>
              <Link href={`/turniere/${t.id}`} className="card flex items-center justify-between gap-3 hover:border-green/50">
                <span>
                  <span className="font-semibold">{t.name}</span>
                  <span className="block text-sm text-muted">
                    {t.city} · {t.startsOn} · {FORMAT[t.format]}
                  </span>
                </span>
                <span className="text-right text-sm">
                  <span className="text-muted">{STATUS[t.status]}</span>
                  <span className="block text-xs text-muted">
                    {t.teams}/{t.maxTeams} Teams · {t.entryFeeCents > 0 ? formatEuro(t.entryFeeCents) : "kostenlos"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
