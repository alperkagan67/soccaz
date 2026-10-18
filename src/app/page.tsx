import Image from "next/image";
import Link from "next/link";
import { and, asc, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/db";
import { matchRequests, teams } from "@/db/schema";
import { formatDateTime } from "@/lib/time";
import { getCurrentUser } from "@/server/session";

async function OpenRequests() {
  const open = await db
    .select({
      id: matchRequests.id,
      team: teams.name,
      city: matchRequests.city,
      startsAt: matchRequests.startsAt,
      durationMin: matchRequests.durationMin,
    })
    .from(matchRequests)
    .innerJoin(teams, eq(teams.id, matchRequests.teamId))
    .where(and(eq(matchRequests.status, "open"), eq(matchRequests.visibility, "public"), isNull(matchRequests.targetTeamId), gte(matchRequests.startsAt, new Date())))
    .orderBy(asc(matchRequests.startsAt))
    .limit(10);

  if (open.length === 0) {
    return <p className="card text-muted">Noch keine offenen Spielsuchen. Sei die Erste, die einen Gegner sucht.</p>;
  }
  return (
    <ul className="space-y-2">
      {open.map((r) => (
        <li key={r.id} className="card">
          <Link href={`/suche/${r.id}`} className="font-semibold hover:text-green">{r.team}</Link>
          <span className="block text-sm text-muted">
            {r.city} · {formatDateTime(r.startsAt)} Uhr · {r.durationMin} Min
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <div className="space-y-8">
      <section className="relative isolate flex min-h-[30rem] flex-col justify-end overflow-hidden rounded-2xl border border-line sm:min-h-[26rem]">
        <video
          className="absolute inset-0 -z-10 h-full w-full object-cover opacity-60"
          src="/videos/socca-reel-main.mp4"
          poster="/brand/socca-reel-main.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="none"
        />
        <div className="flex flex-col gap-3 bg-gradient-to-t from-bg via-bg/60 to-transparent p-5 pt-24 sm:p-8 sm:pt-28">
          <Image src="/brand/socca-logo.jpeg" alt="" width={56} height={56} className="rounded-lg" />
          <h1 className="text-3xl font-extrabold leading-tight sm:text-5xl">
            Hallenfußball.<br />
            <span className="text-green">Gegner finden. Spielen.</span>
          </h1>
          <p className="max-w-md text-muted">Gründe dein Team, lade deine Jungs per Link ein und fordere andere Teams in NRW heraus.</p>
          <div className="flex flex-wrap gap-2">
            <Link href={user ? "/app/teams/neu" : "/anmelden"} className="btn btn-primary">
              {user ? "Team gründen" : "Jetzt starten"}
            </Link>
            <Link href="/suche" className="btn btn-ghost">Spielsuchen ansehen</Link>
            <Link href="/spiele" className="btn btn-ghost">Livescore</Link>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Offene Spielsuchen</h2>
        <OpenRequests />
      </section>
    </div>
  );
}
