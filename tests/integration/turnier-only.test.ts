import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { tournamentMatches } from "@/db/schema-league";
import { createTournament, setOrganizer } from "@/server/tournaments";
import { KOMMT_BALD_TEXT } from "@/lib/turnier-only";
import { cleanup, makeMatch, makeUser } from "./helpers";

// TURNIER_ONLY (Turnier 12.12.): Verhalten der Server-Sperre je Rolle (Gast, Spieler, Admin) mit gesetzter Betriebsart; ohne Variable ist alles offen.
let currentUserId = "";
vi.mock("@/auth", () => ({ auth: async () => (currentUserId ? { user: { id: currentUserId } } : null), signOut: async () => {} }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { assertBereichOffen, assertSpielOffen, bereichGesperrt, spielGesperrt } = await import("@/server/turnier-only");
const { joinLobbyAction } = await import("@/server/actions");
const lobbyEvents = await import("@/app/api/lobby/[id]/events/route");
const spieleStream = await import("@/app/api/spiele/stream/route");
const spielLive = await import("@/app/api/spiele/[id]/live/route");

afterAll(cleanup);
beforeEach(() => {
  currentUserId = "";
});
afterEach(() => {
  delete process.env.TURNIER_ONLY;
});

const als = async (rolle: "gast" | "spieler" | "admin") => {
  currentUserId = rolle === "gast" ? "" : (await makeUser(rolle === "admin" ? "tadm" : "tspieler", rolle === "admin" ? "admin" : "player")).id;
};

describe("Betriebsart aus (Standard): alles offen", () => {
  it("auch ohne gesetzte Variable und mit TURNIER_ONLY=0 sperrt nichts", async () => {
    for (const v of [undefined, "0", "true"]) {
      if (v === undefined) delete process.env.TURNIER_ONLY;
      else process.env.TURNIER_ONLY = v;
      await als("spieler");
      expect(await bereichGesperrt()).toBe(false);
      await expect(assertBereichOffen()).resolves.toBeUndefined();
    }
  });
});

describe("TURNIER_ONLY=1: Gast und Spieler gesperrt, Plattform-Admin darf alles", () => {
  beforeEach(() => {
    process.env.TURNIER_ONLY = "1";
  });
  it("bereichGesperrt/assertBereichOffen je Rolle", async () => {
    await als("gast");
    expect(await bereichGesperrt()).toBe(true);
    await expect(assertBereichOffen()).rejects.toThrow(KOMMT_BALD_TEXT);
    await als("spieler");
    expect(await bereichGesperrt()).toBe(true);
    await expect(assertBereichOffen()).rejects.toThrow(KOMMT_BALD_TEXT);
    await als("admin");
    expect(await bereichGesperrt()).toBe(false);
    await expect(assertBereichOffen()).resolves.toBeUndefined();
  });

  it("Spiel-Aktionen: freies Spiel gesperrt, Turnier-Spiel (Spielart UND Zuordnung) offen, nur Spielart ohne Zuordnung gesperrt, Admin überall, unbekanntes Spiel gesperrt", async () => {
    const frei = await makeMatch({ hoursAhead: 72, priceCents: 0, costCents: 0 });
    const turnier = await makeMatch({ hoursAhead: 72, priceCents: 0, costCents: 0 });
    const nurArt = await makeMatch({ hoursAhead: 72, priceCents: 0, costCents: 0 });
    const nurLink = await makeMatch({ hoursAhead: 72, priceCents: 0, costCents: 0 });
    for (const m of [turnier, nurArt]) await db.update(matches).set({ kind: "tournament" }).where(eq(matches.id, m.match.id));
    const org = await makeUser("torg");
    const admin = await makeUser("tadm2", "admin");
    await setOrganizer(admin.id, org.id, true);
    const t = await createTournament(org.id, { name: "Gate-Cup", city: "Essen", startsAt: new Date(Date.now() + 5 * 86_400_000), registrationDeadline: new Date(Date.now() + 3 * 86_400_000), maxTeams: 4, durationMin: 120, hourlyCents: 8000 } as Parameters<typeof createTournament>[1]);
    await db.insert(tournamentMatches).values([
      { tournamentId: t.id, stage: "ko:2", round: 1, slot: 0, matchId: turnier.match.id },
      { tournamentId: t.id, stage: "ko:2", round: 2, slot: 0, matchId: nurLink.match.id },
    ]);
    await als("spieler");
    expect(await spielGesperrt(frei.match.id)).toBe(true);
    await expect(assertSpielOffen(frei.match.id)).rejects.toThrow(KOMMT_BALD_TEXT);
    expect(await spielGesperrt(turnier.match.id)).toBe(false); // Turnier-Spiel: Captain meldet und bestätigt
    await expect(assertSpielOffen(turnier.match.id)).resolves.toBeUndefined();
    expect(await spielGesperrt(nurArt.match.id)).toBe(true); // Spielart tournament, aber keine Zuordnung
    expect(await spielGesperrt(nurLink.match.id)).toBe(true); // Zuordnung, aber freie Spielart
    expect(await spielGesperrt("00000000-0000-0000-0000-000000000000")).toBe(true);
    expect(await spielGesperrt("kein-uuid")).toBe(true); // keine Spiel-id: gesperrt ohne Datenbankabfrage (kein 500)
    // Live-Kanal: Turnier-Spiel wird NICHT abgewiesen, freies Spiel und Zuordnung ohne Spielart schon
    const live = (id: string) => spielLive.GET(new Request("http://x/"), { params: Promise.resolve({ id }) } as never);
    expect((await live(turnier.match.id)).status).not.toBe(403);
    expect((await live(frei.match.id)).status).toBe(403);
    expect((await live(nurLink.match.id)).status).toBe(403);
    await als("gast");
    expect(await spielGesperrt(frei.match.id)).toBe(true);
    expect(await spielGesperrt(turnier.match.id)).toBe(false);
    await als("admin");
    expect(await spielGesperrt(frei.match.id)).toBe(false);
    expect(await spielGesperrt(nurArt.match.id)).toBe(false);
  });

  it("Lobby-Aktion (joinLobbyAction) liefert die Ruhe-Meldung statt etwas zu ändern", async () => {
    const m = await makeMatch({ hoursAhead: 72, priceCents: 0, costCents: 0 });
    await als("spieler");
    expect(await joinLobbyAction(m.match.id)).toEqual({ error: KOMMT_BALD_TEXT });
  });

  it("Live-Kanäle antworten mit 403 ohne Inhalt (Lobby, Übersicht, Spiel-Live eines Team-Spiels)", async () => {
    const m = await makeMatch({ hoursAhead: 72, priceCents: 0, costCents: 0 });
    await als("spieler");
    const r1 = await lobbyEvents.GET(new Request("http://x/"), { params: Promise.resolve({ id: m.match.id }) } as never);
    expect(r1.status).toBe(403);
    const r2 = await spieleStream.GET(new Request("http://x/"));
    expect(r2.status).toBe(403);
    const r3 = await spielLive.GET(new Request("http://x/"), { params: Promise.resolve({ id: m.match.id }) } as never);
    expect(r3.status).toBe(403);
    expect(await r3.text()).not.toMatch(/Spieler|name|id/i);
  });
});
