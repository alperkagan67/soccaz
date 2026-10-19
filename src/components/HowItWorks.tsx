import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { formatEuro } from "@/lib/money";
import { getT } from "@/server/locale";
import { priceFor } from "@/server/pricing";

const STEPS = ["s1", "s2", "s3", "s4"] as const;

/** Die Plattform in vier Schritten, so einfach wie möglich. Der Preis kommt aus den echten Preisregeln. */
export async function HowItWorks() {
  const { t } = await getT();
  const price = await priceFor(db, null, 60);
  const [counts] = (await db.execute(sql`select (select count(*)::int from teams where archived_at is null) as teams, (select count(*)::int from users where onboarded_at is not null and banned_at is null) as players, (select count(*)::int from matches where status = 'played') as games`)).rows as { teams: number; players: number; games: number }[];
  return (
    <section className="space-y-4" aria-labelledby="how-h" data-testid="how-it-works">
      <div className="space-y-1">
        <h2 id="how-h" className="text-2xl font-bold">{t("how.title")}</h2>
        <p className="text-muted">{t("how.lead")}</p>
      </div>
      <ul className="grid grid-cols-3 gap-2 text-center" aria-label="Socaz in Zahlen" data-testid="platform-stats">
        {[
          [counts.teams, "Teams"],
          [counts.players, "Spieler"],
          [counts.games, "Spiele"],
        ].map(([n, label]) => (
          <li key={label} className="card !p-3">
            <span className="block font-heading text-2xl font-bold tabular-nums">{n}</span>
            <span className="text-xs text-muted">{label}</span>
          </li>
        ))}
      </ul>
      <ol className="grid gap-3 sm:grid-cols-2">
        {STEPS.map((s, i) => (
          <li key={s} className="card flex gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-green font-heading text-lg font-extrabold text-black" aria-hidden>
              {i + 1}
            </span>
            <span>
              <span className="block font-semibold">{t(`how.${s}.title` as const)}</span>
              <span className="block text-sm text-muted">{t(`how.${s}.text` as const)}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="card space-y-1">
        <h3 className="font-semibold">{t("how.price.title")}</h3>
        <p className="text-sm text-muted">{t("how.price.text", { price60: price ? formatEuro(price.priceCents) : "–" })}</p>
        <Link href="/hilfe" className="text-sm text-green underline">{t("how.more")}</Link>
      </div>
    </section>
  );
}
