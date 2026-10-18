import type { Metadata } from "next";
import Link from "next/link";
import { formatDateTime } from "@/lib/time";
import { listProEvents } from "@/server/pro-events";

export const metadata: Metadata = { title: "Profi-Tag" };

const STATUS = { open: "Bewerbung offen", drawn: "Ausgelost", cancelled: "Abgesagt" } as const;

export default async function ProDayPage() {
  const events = await listProEvents();
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Profi-Tag</h1>
        <p className="text-muted">Ein verifiziertes Profi-Team spielt gegen Amateur-Teams. Bewirb dich mit deinem Team, wir losen die Gegner aus.</p>
      </header>
      {events.length === 0 ? (
        <p className="card text-muted">Aktuell ist kein Profi-Tag geplant.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={`/profitag/${e.id}`} className="card flex items-center justify-between gap-3 hover:border-green/50">
                <span>
                  <span className="font-semibold">{e.title}</span>
                  <span className="block text-sm text-muted">
                    {e.proTeam} · {e.city} · {formatDateTime(e.startsAt)} Uhr
                  </span>
                </span>
                <span className="text-right text-sm text-muted">
                  {STATUS[e.status]}
                  <span className="block text-xs">{e.slots} {e.slots === 1 ? "Platz" : "Plätze"}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
