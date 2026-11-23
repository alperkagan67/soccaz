import type { Metadata } from "next";
import Link from "next/link";
import { formatEuro } from "@/lib/money";
import { CITIES } from "@/lib/validation";
import { getCurrentUser } from "@/server/session";
import { isCaptainOfAnyTeam, listTournaments } from "@/server/tournaments";

export const metadata: Metadata = { title: "Turniere" };

const FORMAT = { round_robin: "Jeder gegen jeden", knockout: "K.-o.-System", groups_ko: "Gruppen und K.-o.-Runde" } as const;
const STATUS = { registration: "Anmeldung offen", payment: "Zahlung läuft", running: "Läuft", finished: "Beendet", cancelled: "Abgesagt" } as const;

// 013 M3 PR 2: Turnierliste als einfache Zeilen in EINER Karte (AC-30 c), keine Hauptaktion in den Zeilen (AC-30 b), Größen 3xl, base, sm (AC-30 e).
// "Team anmelden" zeigt nur, wer Captain ist und wo die Anmeldung offen und nicht voll ist; angemeldet wird auf der Turnierseite, und `registerTeam` prüft Team-Admin und offene Anmeldung am SERVER (nicht diese Seite).
export default async function TournamentsPage({ searchParams }: PageProps<"/turniere">) {
  const sp = await searchParams;
  const city = typeof sp.city === "string" && (CITIES as readonly string[]).includes(sp.city) ? sp.city : undefined;
  const user = await getCurrentUser();
  const [list, captain] = await Promise.all([listTournaments({ city, viewerId: user?.id ?? null }), user ? isCaptainOfAnyTeam(user.id) : Promise.resolve(false)]);
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Turniere</h1>
        <p className="text-muted">Öffentliche Turniere und deine eigenen. Private Turniere erreichst du nur über den Einladungslink des Veranstalters. Jeder Spieler zahlt seinen Eintritt selbst.</p>
      </header>
      <form className="flex gap-2">
        <select name="city" defaultValue={city ?? ""} aria-label="Stadt" className="field !w-auto flex-1">
          <option value="">Alle Städte</option>
          {CITIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button className="btn btn-ghost">Anzeigen</button>
      </form>
      {user?.onboardedAt && (
        <Link href="/app/turniere/neu" className="btn btn-ghost w-full">
          Turnier veranstalten
        </Link>
      )}
      <p className="text-sm text-muted">Nur freigeschaltete Veranstalter legen Turniere an. Wenn du ein Turnier starten willst, ruf den Socaz-Admin an oder schreib uns eine E-Mail.</p>
      {list.length === 0 ? (
        <p className="card text-muted">Aktuell sind keine Turniere eingetragen.</p>
      ) : (
        <ul className="card divide-y divide-line" data-testid="tournament-list">
          {list.map((t) => {
            const open = t.status === "registration" && t.teams < t.maxTeams;
            return (
              <li key={t.id} className="space-y-2 py-3 first:pt-0 last:pb-0" data-testid="tournament-row">
                <Link href={`/turniere/${t.id}`} className="block space-y-1 hover:text-accent-fg">
                  <span className="font-semibold">
                    {t.name}
                    {t.isPrivate && <span className="ml-2 rounded border border-line px-2 py-0.5 text-sm font-normal text-muted">privat</span>}
                  </span>
                  <span className="block text-sm text-muted">
                    {t.city} · {t.startsOn} · {FORMAT[t.format]}
                  </span>
                </Link>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted">
                    <span className="font-semibold text-ink">{STATUS[t.status]}</span> · {t.teams}/{t.maxTeams} Teams · {t.entryFeeCents > 0 ? `${formatEuro(t.entryFeeCents)} pro Spieler` : "kostenlos"}
                  </p>
                  {open &&
                    (captain ? (
                      <Link href={`/turniere/${t.id}`} className="btn btn-ghost" data-testid="tournament-register">
                        Team anmelden
                      </Link>
                    ) : (
                      <p className="text-sm text-muted" data-testid="tournament-captains-only">
                        Nur Captains melden Teams an
                      </p>
                    ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
