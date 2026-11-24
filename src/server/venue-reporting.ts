// Vertrag 011 M3 (AC-5), Plan docs/design/plan-011-m3.md, Entscheide t2q 2026-11-24: Buchungen und "Durchlaufgeld (vorgemerkt)" für Hallenbetreiber, NUR lesend und NUR für die eigenen Hallen.
// Regeln:
//  - EINE Quelle für "darf diese Halle sehen": venueIdsOf (venue-access-rules.ts: aktiver Zugang, Konto nicht gesperrt, kein Admin). Jede Abfrage filtert serverseitig auf diese Hallen; eine fremde Halle in `venueId` liefert dasselbe wie "keine Hallen" (kein Orakel).
//  - KEINE Personendaten: kein Spielername, keine E-Mail, keine Nutzerkennung, bei Turnieren KEIN Veranstalter (Betreiber namenfrei, AC-17, Backlog 216). Gezeigt werden Team-/Turniername (Nicht-Personen), Zahlen, Status, Beträge.
//  - Standardansicht: aktueller Monat und Vormonat (Europe/Berlin); Archiv per Monatsauswahl (monat=JJJJ-MM, nur gültige Monate, sonst Standard).
//  - Durchlaufgeld: Saldo des Kontos venue_payable je Spiel aus dem Hauptbuch (Gutschriften minus Belastungen: Provision, Bonus, Erstattung), Status "vorgemerkt" (reale Auszahlung erst mit Stripe Connect). Wortlaut ENTWURF (Anwalt).
//  - Rechnungen sind NICHT Teil dieses Moduls (Entscheid t2q: Abruf erst nach Freigabe der Rechnungsvorlage durch den Steuerberater).
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { venueIdsOf } from "./venue-access-rules";

const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/;

export type VenueRef = { id: string; name: string };
export type HallStatus = "zugesagt" | "abgelehnt" | "offen" | "keine-anfrage";
export type VenueBooking = {
  kind: "teamspiel" | "privatspiel" | "turnier";
  matchId: string | null; // Spiel-id (keine Personenkennung); bei Turnieren null
  tournamentId: string | null;
  venueId: string;
  venueName: string;
  startsAt: Date;
  durationMin: number | null;
  title: string; // Teams ("A gegen B") oder Turniername; nie ein Personenname
  count: number; // Spielerzahl (Spiel) bzw. Teamzahl (Turnier)
  countLabel: "Spieler" | "Teams";
  status: string;
  hall: HallStatus;
  rentCents: number | null; // Hallenmiete laut Regel bzw. Hallenkosten des Turniers
};
export type VenuePayout = {
  matchId: string;
  venueId: string;
  venueName: string;
  startsAt: Date;
  title: string;
  creditedCents: number; // Anteile der Spieler auf venue_payable
  deductedCents: number; // Provision, 10er-Bonus, Erstattungen (Belastungen von venue_payable)
  netCents: number; // vorgemerktes Durchlaufgeld
  status: "vorgemerkt";
};
export type ReportView<T> = { venues: VenueRef[]; monat: string | null; monate: string[]; standard: string[]; rows: T[] };

/** Die Hallen, die diese Person sehen darf (eine Quelle), optional auf eine Halle eingeschränkt; eine fremde Halle ergibt eine leere Liste. */
async function ownVenues(userId: string | null, venueId?: string | null): Promise<VenueRef[]> {
  if (!userId) return [];
  const mine = await venueIdsOf(userId);
  const ids = venueId ? mine.filter((id) => id === venueId) : mine;
  if (ids.length === 0) return [];
  const rows = await db.execute(sql`select id, name from venues where id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)}) order by name`);
  return (rows.rows as VenueRef[]).map((r) => ({ id: r.id, name: r.name }));
}

/** Monate der Standardansicht: aktueller Monat und Vormonat nach Berliner Zeit. */
export function standardMonths(now: Date): string[] {
  const berlin = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit" }).format(now); // "2026-11"
  const [y, m] = berlin.split("-").map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  return [berlin, prev];
}

const monthsOf = (monat: string | null | undefined, now: Date) => (monat && MONAT.test(monat) ? [monat] : standardMonths(now));
const inList = (xs: string[]) => sql.join(xs.map((x) => sql`${x}`), sql`, `);
const venueList = (vs: VenueRef[]) => sql.join(vs.map((v) => sql`${v.id}::uuid`), sql`, `);

/** Monate mit Buchungen der eigenen Hallen (für die Monatsauswahl des Archivs), neueste zuerst. */
async function availableMonths(vs: VenueRef[]): Promise<string[]> {
  if (vs.length === 0) return [];
  const rows = await db.execute(sql`
    select distinct to_char(t.at at time zone 'Europe/Berlin', 'YYYY-MM') as monat from (
      select m.starts_at as at from matches m where m.venue_id in (${venueList(vs)}) and m.kind in ('team', 'private')
      union all
      select coalesce(t.starts_at, t.starts_on::timestamp at time zone 'Europe/Berlin') as at from tournaments t where t.venue_id in (${venueList(vs)})
    ) t order by monat desc`);
  return (rows.rows as { monat: string }[]).map((r) => r.monat);
}

/** Buchungen der eigenen Hallen (Spiele und Turniere), nur ein bzw. zwei Monate (Standard: aktueller und Vormonat). */
export async function listVenueBookings(userId: string | null, opts: { venueId?: string | null; monat?: string | null; now?: Date } = {}): Promise<ReportView<VenueBooking>> {
  const now = opts.now ?? new Date();
  const vs = await ownVenues(userId, opts.venueId);
  const months = monthsOf(opts.monat, now);
  const view: ReportView<VenueBooking> = { venues: vs, monat: opts.monat && MONAT.test(opts.monat) ? opts.monat : null, monate: [], standard: standardMonths(now), rows: [] };
  if (vs.length === 0) return view;
  view.monate = await availableMonths(vs);

  const games = await db.execute(sql`
    select m.id as "matchId", m.kind, v.id as "venueId", v.name as "venueName", m.starts_at as "startsAt", m.duration_min as "durationMin", m.status, m.cost_cents as "rentCents",
      th.name as home, ta.name as away,
      (select count(*)::int from match_participants p where p.match_id = m.id and p.team_id is not null) as count,
      coalesce((select r.status from match_hall_requests r where r.match_id = m.id and r.venue_id = m.venue_id), 'keine-anfrage') as hall
    from matches m
    join venues v on v.id = m.venue_id
    join teams th on th.id = m.home_team_id
    join teams ta on ta.id = m.away_team_id
    where m.venue_id in (${venueList(vs)}) and m.kind in ('team', 'private')
      and to_char(m.starts_at at time zone 'Europe/Berlin', 'YYYY-MM') in (${inList(months)})
    order by m.starts_at`);
  const turniere = await db.execute(sql`
    select t.id as "tournamentId", v.id as "venueId", v.name as "venueName", coalesce(t.starts_at, t.starts_on::timestamp at time zone 'Europe/Berlin') as "startsAt", t.duration_min as "durationMin", t.status, t.total_cents as "rentCents", t.name,
      (select count(*)::int from tournament_teams x where x.tournament_id = t.id) as count,
      case when t.venue_declined_at is not null then 'abgelehnt' when t.venue_confirmed_at is not null then 'zugesagt' else 'offen' end as hall
    from tournaments t
    join venues v on v.id = t.venue_id
    where t.venue_id in (${venueList(vs)})
      and to_char(coalesce(t.starts_at, t.starts_on::timestamp at time zone 'Europe/Berlin') at time zone 'Europe/Berlin', 'YYYY-MM') in (${inList(months)})
    order by 4`);

  for (const g of games.rows as Record<string, unknown>[]) {
    const hall = String(g.hall);
    view.rows.push({
      kind: g.kind === "private" ? "privatspiel" : "teamspiel",
      matchId: String(g.matchId),
      tournamentId: null,
      venueId: String(g.venueId),
      venueName: String(g.venueName),
      startsAt: new Date(g.startsAt as string),
      durationMin: g.durationMin as number,
      title: `${g.home} gegen ${g.away}`,
      count: Number(g.count),
      countLabel: "Spieler",
      status: String(g.status),
      hall: hall === "confirmed" ? "zugesagt" : hall === "declined" ? "abgelehnt" : hall === "pending" ? "offen" : "keine-anfrage",
      rentCents: g.rentCents as number | null,
    });
  }
  for (const t of turniere.rows as Record<string, unknown>[]) {
    view.rows.push({
      kind: "turnier",
      matchId: null,
      tournamentId: String(t.tournamentId),
      venueId: String(t.venueId),
      venueName: String(t.venueName),
      startsAt: new Date(t.startsAt as string),
      durationMin: t.durationMin as number | null,
      title: String(t.name), // Turniername; der Veranstalter wird NIE gelesen (Betreiber namenfrei)
      count: Number(t.count),
      countLabel: "Teams",
      status: String(t.status),
      hall: t.hall as HallStatus,
      rentCents: t.rentCents as number | null,
    });
  }
  view.rows.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return view;
}

/** Durchlaufgeld (vorgemerkt) der eigenen Hallen je Spiel aus dem Hauptbuch, gleiche Monatslogik wie die Buchungen. Keine Auszahlung: reale Auszahlung erst mit Stripe Connect. */
export async function listVenuePayouts(userId: string | null, opts: { venueId?: string | null; monat?: string | null; now?: Date } = {}): Promise<ReportView<VenuePayout> & { totalNetCents: number }> {
  const now = opts.now ?? new Date();
  const vs = await ownVenues(userId, opts.venueId);
  const months = monthsOf(opts.monat, now);
  const view = { venues: vs, monat: opts.monat && MONAT.test(opts.monat) ? opts.monat : null, monate: [] as string[], standard: standardMonths(now), rows: [] as VenuePayout[], totalNetCents: 0 };
  if (vs.length === 0) return view;
  view.monate = await availableMonths(vs);
  const res = await db.execute(sql`
    select m.id as "matchId", v.id as "venueId", v.name as "venueName", m.starts_at as "startsAt", th.name as home, ta.name as away,
      coalesce(sum(case when l.credit_account = 'venue_payable' then l.amount_cents else 0 end), 0)::int as credited,
      coalesce(sum(case when l.debit_account = 'venue_payable' then l.amount_cents else 0 end), 0)::int as deducted
    from matches m
    join venues v on v.id = m.venue_id
    join teams th on th.id = m.home_team_id
    join teams ta on ta.id = m.away_team_id
    join ledger_entries l on l.match_id = m.id and (l.credit_account = 'venue_payable' or l.debit_account = 'venue_payable')
    where m.venue_id in (${venueList(vs)}) and m.kind in ('team', 'private')
      and to_char(m.starts_at at time zone 'Europe/Berlin', 'YYYY-MM') in (${inList(months)})
    group by m.id, v.id, v.name, m.starts_at, th.name, ta.name
    order by m.starts_at`);
  for (const r of res.rows as Record<string, unknown>[]) {
    const credited = Number(r.credited);
    const deducted = Number(r.deducted);
    view.rows.push({ matchId: String(r.matchId), venueId: String(r.venueId), venueName: String(r.venueName), startsAt: new Date(r.startsAt as string), title: `${r.home} gegen ${r.away}`, creditedCents: credited, deductedCents: deducted, netCents: credited - deducted, status: "vorgemerkt" });
  }
  view.totalNetCents = view.rows.reduce((s, r) => s + r.netCents, 0);
  return view;
}
