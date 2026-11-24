import Image from "next/image";
import Link from "next/link";
import { BoardSection } from "@/components/BoardSection";
import { MyGames } from "@/components/MyGames";
import { GameModes } from "@/components/GameModes";
import { HowItWorks } from "@/components/HowItWorks";
import { getT } from "@/server/locale";
import { getCurrentUser } from "@/server/session";
import { activeSponsors } from "@/server/sponsors";
import { gesperrtFuerNutzer } from "@/lib/turnier-only";

function OpenRequests() {
  return <BoardSection limit={6} />;
}

async function Sponsors() {
  const [list, { t }] = await Promise.all([activeSponsors("sponsor"), getT()]);
  if (list.length === 0) return null;
  return (
    <section className="space-y-2" aria-label={t("home.partners")}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{t("home.partners")}</h2>
      <ul className="flex flex-wrap gap-2">
        {list.map((s) => (
          <li key={s.id}>
            <a href={`/api/sponsor/${s.id}`} rel="sponsored noopener" target="_blank" className="card block !py-2 text-sm hover:border-accent/50">
              <span className="font-semibold">{s.name}</span>
              {s.tagline && <span className="block text-sm text-muted">{s.tagline}</span>}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function Home() {
  const [user, { t }] = await Promise.all([getCurrentUser(), getT()]);
  const nurTurnier = gesperrtFuerNutzer(user); // TURNIER_ONLY: Hauptaktion Turniere, keine Spiel-Bereiche

  return (
    <div className="space-y-8">
      {user?.onboardedAt && !nurTurnier && <MyGames userId={user.id} />}

      <section className="relative isolate flex min-h-[30rem] flex-col justify-end overflow-hidden rounded-2xl border border-line sm:min-h-[26rem]">
        {/* Standbild statt Video bis zur Lizenzklärung (Entscheid Nutzer, 013 M2c). Die Datei /videos/socca-reel-main.mp4 bleibt in public/, wird aber nicht mehr eingebunden. Die Höhe der Fläche ist fest (min-h am section): kein Layoutsprung. */}
        <Image src="/brand/socca-reel-main.jpg" alt="" fill priority sizes="100vw" className="-z-10 object-cover opacity-60" />
        <div className="hero-scrim flex flex-col gap-3 p-5 pt-24 sm:p-8 sm:pt-28">
          <Image src="/brand/socca-logo.jpeg" alt="" width={56} height={56} className="rounded-lg" />
          <h1 className="text-4xl font-extrabold leading-tight">
            {t("home.title1")}<br />
            <span className="text-accent-fg">{t("home.title2")}</span>
          </h1>
          <p className="max-w-md text-muted">{t("home.lead")}</p>
          {/* Eine Hauptaktion (AC-30 b): Angemeldete gehen weiter zu Meine Spiele, Gäste starten. Alles andere ist ruhig (ghost); "Lobby aufmachen" steht in der Karte Teamspiel. */}
          <div className="flex flex-wrap gap-2">
            <Link href={nurTurnier ? "/turniere" : user ? "/app" : "/anmelden"} className="btn btn-primary" data-testid="home-main-action">
              {nurTurnier ? t("home.toTournaments") : user ? t("home.continue") : t("home.start")}
            </Link>
            {user && <Link href="/app/teams/neu" className="btn btn-ghost">{t("home.createTeam")}</Link>}
            {!nurTurnier && <Link href="/suche" className="btn btn-ghost">{t("home.viewRequests")}</Link>}
          </div>
        </div>
      </section>

      <GameModes signedIn={Boolean(user)} quiet nurTurnier={nurTurnier} />

      <HowItWorks />

      {!nurTurnier && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t("home.openRequests")}</h2>
          <OpenRequests />
        </section>
      )}
      <Sponsors />
    </div>
  );
}
