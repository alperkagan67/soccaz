import Link from "next/link";
import { TeamColorDot } from "@/components/TeamColor";
import { LinkButton } from "@/components/ui/LinkButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { myTournamentsAsPlayerOrOrganizer } from "@/server/tournaments";
import { listMyTeams } from "@/server/teams";

const STATUS = { registration: "Anmeldung offen", payment: "Zahlung läuft", running: "Läuft", finished: "Beendet", cancelled: "Abgesagt" } as const;
const TONE = { registration: "info", payment: "info", running: "ok", finished: "neutral", cancelled: "neutral" } as const;

/**
 * Turnier-Variante von /app (TURNIER_ONLY): nur "Meine Turniere" und "Meine Teams", keine Spiele, Herausforderungen und Spielarten.
 * Eine Hauptaktion im Seitenkopf: zu den Turnieren.
 */
export async function TurnierDashboard({ user }: { user: { id: string; name: string; position: string | null; city: string | null } }) {
  const [turniere, teams] = await Promise.all([myTournamentsAsPlayerOrOrganizer(user.id), listMyTeams(user.id)]);
  const firstName = user.name.split(" ")[0];
  const offen = turniere.filter((t) => t.status !== "finished" && t.status !== "cancelled").length;
  return (
    <PageShell width="narrow">
      <PageHeader
        title={`Hey ${firstName}`}
        meta={[user.position, user.city].filter(Boolean).join(" · ")}
        stand={
          <p className="font-semibold" data-testid="turnier-stand">
            {turniere.length === 0 ? "Du bist noch in keinem Turnier." : offen > 0 ? `Du bist in ${offen} laufenden oder kommenden Turnier${offen === 1 ? "" : "en"}.` : "Deine Turniere sind beendet."}
          </p>
        }
        action={{ label: "Zu den Turnieren", href: "/turniere" }}
      />

      <section className="space-y-3" aria-label="Meine Turniere" data-testid="my-tournaments">
        <h2 className="text-lg font-semibold">Meine Turniere</h2>
        {turniere.length === 0 ? (
          <p className="card text-muted">Noch kein Turnier. Auf der Turnierseite meldet der Captain sein Team an, danach trittst du dem Kader bei.</p>
        ) : (
          <ul className="space-y-2">
            {turniere.map((t) => (
              <li key={t.id}>
                <Link href={`/turniere/${t.id}`} className="card flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-2 hover:border-accent" data-testid="my-tournament">
                  <span className="min-w-0 flex-1 basis-48">
                    <span className="block truncate font-semibold">{t.name}</span>
                    <span className="block text-sm text-muted">{t.startsOn}{t.organizer ? " · Du veranstaltest" : ""}</span>
                  </span>
                  <StatusBadge status={TONE[t.status]} label={STATUS[t.status]} viewer="self" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Meine Teams</h2>
          <LinkButton href="/app/teams/neu" size="sm">Team gründen</LinkButton>
        </div>
        {teams.length === 0 ? (
          <p className="card text-muted">Du bist noch in keinem Team. Gründe eins oder öffne einen Einladungslink, den dir ein Team-Admin schickt.</p>
        ) : (
          <ul className="space-y-2">
            {teams.map((t) => (
              <li key={t.id}>
                <Link href={`/teams/${t.slug}`} className="card flex min-h-11 items-center justify-between hover:border-accent">
                  <span>
                    <span className="font-semibold"><TeamColorDot color={t.color} slug={t.slug} className="mr-2" />{t.name}</span>
                    <span className="block text-sm text-muted">{t.city}</span>
                  </span>
                  <span className="text-sm text-muted">{t.role === "player" ? "Spieler" : "Team-Admin"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav aria-label="Schnellzugriff" className="grid grid-cols-3 gap-2 text-sm">
        <Link href={`/spieler/${user.id}`} className="card flex min-h-11 items-center justify-center text-center hover:border-accent">Mein Profil</Link>
        <Link href="/app/einstellungen" className="card flex min-h-11 items-center justify-center text-center hover:border-accent">Einstellungen</Link>
        <Link href="/hilfe" className="card flex min-h-11 items-center justify-center text-center hover:border-accent">Hilfe</Link>
      </nav>
    </PageShell>
  );
}
