import type { Metadata } from "next";
import Link from "next/link";
import { LiveIndicator } from "@/components/LiveIndicator";
import { formatDateTime } from "@/lib/time";
import { getScoreboard } from "@/server/results";

export const metadata: Metadata = { title: "Livescore" };

type Row = Awaited<ReturnType<typeof getScoreboard>>["live"][number];

function MatchRow({ m, showScore }: { m: Row; showScore: boolean }) {
  return (
    <li>
      <Link href={`/spiele/${m.id}`} className="card flex items-center justify-between gap-3 hover:border-green">
        <span className="min-w-0">
          <span className="block truncate font-semibold">{m.homeName}</span>
          <span className="block truncate font-semibold">{m.awayName}</span>
          <span className="block text-xs text-muted">{formatDateTime(m.startsAt)} Uhr</span>
        </span>
        {showScore && (
          <span className="font-heading text-2xl font-extrabold tabular-nums">
            {m.homeScore ?? 0}
            <br />
            {m.awayScore ?? 0}
          </span>
        )}
      </Link>
    </li>
  );
}

function Section({ title, rows, showScore, empty }: { title: string; rows: Row[]; showScore: boolean; empty: string }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? <p className="card text-sm text-muted">{empty}</p> : <ul className="space-y-2">{rows.map((m) => <MatchRow key={m.id} m={m} showScore={showScore} />)}</ul>}
    </section>
  );
}

export default async function ScoreboardPage() {
  const { live, upcoming, finished } = await getScoreboard();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Livescore</h1>
        <LiveIndicator eventsUrl="/api/spiele/stream" />
      </div>
      <Section title="Läuft gerade" rows={live} showScore empty="Gerade läuft kein Spiel." />
      <Section title="Als Nächstes" rows={upcoming} showScore={false} empty="Keine bestätigten Spiele in den nächsten 14 Tagen." />
      <Section title="Ergebnisse" rows={finished} showScore empty="Noch keine beendeten Spiele." />
    </div>
  );
}
