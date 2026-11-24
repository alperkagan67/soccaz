import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tournaments } from "@/db/schema-league";
import { ZAHLUNGEN_AUS_HINWEIS } from "@/lib/zahlungen-aus";
import { ZP } from "@/lib/zahlungspflicht-texte";
import { getSetting, setSetting } from "@/server/settings";
import { setOrganizer } from "@/server/tournaments";
import { cleanup, makeUser } from "./helpers";

// Gratis-Turnier PR A, R-T421: bei Zahlungen AUS erzwingt die Server-Aktion Preis 0 (ein von Hand gesendetes hourlyRent wird ignoriert) und das Teamlimit 16; bei Zahlungen AN gilt der gesendete Preis.
const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("@/server/session", () => ({ requireUser: async () => session.user, requirePermission: async () => session.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

let before: boolean;
beforeAll(async () => {
  before = (await getSetting<boolean>("payments_enabled", false)) === true;
});
afterAll(async () => {
  await setSetting(null, "payments_enabled", before);
  await cleanup();
});

const T0 = Date.now();
const local = (days: number) => new Date(T0 + days * 86_400_000 + 3_600_000).toISOString().slice(0, 16); // Berliner Ortszeit ist UTC+1/+2: nur Zukunft zaehlt
function form(over: Record<string, string> = {}) {
  const f = new FormData();
  const base: Record<string, string> = { name: "Aktion-Cup", city: "Essen", maxTeams: "8", durationHours: "3", startsAt: local(12), registrationDeadline: local(8), hourlyRent: "80", matchMinutes: "15", venueText: "Halle" };
  for (const [k, v] of Object.entries({ ...base, ...over })) f.set(k, v);
  return f;
}
async function create(over: Record<string, string> = {}) {
  const { createTournamentAction } = await import("@/server/tournament-actions");
  session.user = await organizer();
  try {
    const result = await createTournamentAction({}, form(over));
    return { result, id: null as string | null };
  } catch (e) {
    const m = /^REDIRECT:\/turniere\/(.+)$/.exec((e as Error).message);
    if (!m) throw e;
    return { result: null, id: m[1] };
  }
}
async function organizer() {
  const o = await makeUser("ga-org");
  const admin = await makeUser("ga-adm", "admin");
  await setOrganizer(admin.id, o.id, true);
  return o;
}

describe("Server-Aktion Turnier anlegen", () => {
  it("Zahlungen AUS: ein von Hand gesendeter Preis (80) wird ignoriert, das Turnier ist kostenlos", async () => {
    await setSetting(null, "payments_enabled", false);
    const { id } = await create({ hourlyRent: "80" });
    expect(id).not.toBeNull();
    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, id!));
    expect(t.hourlyCents).toBe(0);
    expect(t.totalCents).toBe(0);
  });
  it("Zahlungen AUS: mehr als 16 Teams werden serverseitig abgelehnt (Fehler am Feld), genau 16 gehen", async () => {
    await setSetting(null, "payments_enabled", false);
    const tooMany = await create({ maxTeams: "17" });
    expect(tooMany.id).toBeNull();
    expect(tooMany.result?.error).toMatch(/bis zu 16 Teams/);
    expect(tooMany.result?.fieldErrors?.maxTeams).toBeTruthy();
    expect((await create({ maxTeams: "16" })).id).not.toBeNull();
  });
  it("Zahlungen AN: der gesendete Preis gilt (160 Euro bei 2 Stunden mal 80), Teamlimit 32 des Kerns", async () => {
    await setSetting(null, "payments_enabled", true);
    const { id } = await create({ hourlyRent: "80", durationHours: "2", maxTeams: "20", venueId: "" });
    // ohne Partnerhalle bei Karte AUS (Karte steht in dieser Umgebung aus) entsteht das Turnier mit Preis
    expect(id).not.toBeNull();
    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, id!));
    expect(t.totalCents).toBe(16000);
    expect(t.maxTeams).toBe(20);
  });
  it("der Gratis-Hinweis kommt aus EINER Quelle", () => {
    expect(ZP.tournamentFreeNote).toContain(ZAHLUNGEN_AUS_HINWEIS);
  });
});
