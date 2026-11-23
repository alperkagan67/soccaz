import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { cleanup, makeUser } from "./helpers";

// 013 v3 AC-26, Spieler-Onboarding PR 1: die Server-Aktion mit der ECHTEN Sitzungspruefung; nur Anmeldung, Abmeldung und Weiterleitung sind ersetzt.
// Geprueft: Prueffunktion (src/lib/player-onboarding.ts), Alter und Konto-Loeschen unter 16 (Rechtsaussage unveraendert), Geburtsdatum wird nie gespeichert, Fehleingaben schreiben nichts.
let currentUserId = "";
const signOutCalls: unknown[] = [];
// Schranke fuer den Wettlauf-Test: beide Aufrufe warten in auth(), bis beide da sind, und lesen danach gemeinsam den (noch nicht eingerichteten) Nutzer
const barrier: { want: number; seen: number; open: (() => void) | null; gate: Promise<void> | null } = { want: 0, seen: 0, open: null, gate: null };
vi.mock("@/auth", () => ({
  auth: async () => {
    if (barrier.want > 0) {
      barrier.seen += 1;
      if (barrier.seen >= barrier.want) barrier.open?.();
      await barrier.gate;
    }
    return currentUserId ? { user: { id: currentUserId } } : null;
  },
  signOut: async (opts: unknown) => {
    signOutCalls.push(opts);
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { completeOnboardingAction } from "@/server/actions";

afterAll(async () => {
  await cleanup();
});
beforeEach(() => {
  currentUserId = "";
  signOutCalls.length = 0;
});

/** Neues Konto, noch nicht eingerichtet (wie nach der Anmeldung). */
async function fresh(tag = "pob") {
  const u = await makeUser(tag);
  await db.update(users).set({ onboardedAt: null, ageConfirmedAt: null, termsAcceptedAt: null, city: null, position: null }).where(eq(users.id, u.id));
  currentUserId = u.id;
  return u;
}
const row = async (id: string) => (await db.select().from(users).where(eq(users.id, id)))[0];
const form = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ name: "Alex Neu", city: "Essen", position: "Angriff", birthDate: "1995-05-05", terms: "on", next: "", ...over })) fd.set(k, v);
  return fd;
};
const yearsAgo = (years: number, dayOffset = 0) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return d.toISOString().slice(0, 10);
};

describe("completeOnboardingAction: gueltig", () => {
  it("setzt Name, Stadt, Position, Zeitpunkte und onboarded_at, schreibt den Audit und leitet nach /app; das Geburtsdatum steht nirgends", async () => {
    const u = await fresh();
    await expect(completeOnboardingAction(undefined, form({ birthDate: "1993-03-07" }))).rejects.toThrow("REDIRECT:/app");
    const r = await row(u.id);
    expect(r).toMatchObject({ name: "Alex Neu", city: "Essen", position: "Angriff" });
    expect(r.onboardedAt).not.toBeNull();
    expect(r.ageConfirmedAt).not.toBeNull();
    expect(r.termsAcceptedAt).not.toBeNull();
    expect(JSON.stringify(r)).not.toContain("1993-03-07");
    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, u.id));
    expect(audits.some((a) => a.action === "user.onboarded")).toBe(true);
    expect(JSON.stringify(audits)).not.toContain("1993-03-07");
    expect(signOutCalls).toHaveLength(0);
  });

  it("Rücksprungziel: ein interner Pfad wird benutzt, fremde Ziele fallen auf /app", async () => {
    await fresh("pobn1");
    await expect(completeOnboardingAction(undefined, form({ next: "/lobby/abc?x=1" }))).rejects.toThrow("REDIRECT:/lobby/abc?x=1");
    await fresh("pobn2");
    await expect(completeOnboardingAction(undefined, form({ next: "//evil.example/x" }))).rejects.toThrow("REDIRECT:/app");
    await fresh("pobn3");
    await expect(completeOnboardingAction(undefined, form({ next: "https://evil.example" }))).rejects.toThrow("REDIRECT:/app");
  });

  it("genau 16 Jahre alt: bleibt, wird eingerichtet", async () => {
    const u = await fresh("pob16");
    await expect(completeOnboardingAction(undefined, form({ birthDate: yearsAgo(16) }))).rejects.toThrow("REDIRECT:/app");
    expect((await row(u.id)).onboardedAt).not.toBeNull();
    expect(signOutCalls).toHaveLength(0);
  });
});

describe("completeOnboardingAction: unter 16 (Rechtsaussage unveraendert)", () => {
  it("einen Tag vor dem 16. Geburtstag: Konto geloescht, Abmeldung nach /unter-16, nichts gespeichert", async () => {
    const u = await fresh("pob15");
    await completeOnboardingAction(undefined, form({ birthDate: yearsAgo(16, 1) }));
    expect(await db.select().from(users).where(eq(users.id, u.id))).toHaveLength(0);
    expect(signOutCalls).toEqual([{ redirectTo: "/unter-16" }]);
  });

  it("deutlich unter 16 (10 Jahre): ebenso", async () => {
    const u = await fresh("pob10");
    await completeOnboardingAction(undefined, form({ birthDate: yearsAgo(10) }));
    expect(await db.select().from(users).where(eq(users.id, u.id))).toHaveLength(0);
    expect(signOutCalls).toHaveLength(1);
  });
});

describe("completeOnboardingAction: Fehleingaben schreiben nichts und loeschen kein Konto", () => {
  it("Zukunftsdatum, vor 1900, unmögliches Datum: Feldfehler am Geburtsdatum, Konto bleibt, nicht eingerichtet, keine Abmeldung", async () => {
    const u = await fresh("pobf");
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    for (const bad of ["2099-01-01", tomorrow, "1899-12-31", "2020-02-31", "abc", ""]) {
      const res = await completeOnboardingAction(undefined, form({ birthDate: bad }));
      expect(res?.fieldErrors?.birthDate, bad).toBeTruthy();
    }
    const r = await row(u.id);
    expect(r).toBeDefined();
    expect(r.onboardedAt).toBeNull();
    expect(r.city).toBeNull();
    expect(signOutCalls).toHaveLength(0);
  });

  it("Feldfehler je Feld (Name, Stadt, Position, Zustimmung): fieldErrors mit Feldnamen, nichts geschrieben", async () => {
    const u = await fresh("pobg");
    const res = await completeOnboardingAction(undefined, form({ name: "a", city: "Atlantis", position: "Libero", terms: "" }));
    expect(Object.keys(res?.fieldErrors ?? {}).sort()).toEqual(["city", "name", "position", "terms"]);
    const r = await row(u.id);
    expect(r.onboardedAt).toBeNull();
    expect(r.position).toBeNull();
  });

  it("fremde Felder im FormData (role, isOwner) werden ignoriert", async () => {
    const u = await fresh("pobh");
    await expect(completeOnboardingAction(undefined, form({ role: "admin", isOwner: "true" }))).rejects.toThrow("REDIRECT:/app");
    const r = await row(u.id);
    expect(r.role).toBe("player");
    expect(r.isOwner).toBe(false);
  });
});

describe("completeOnboardingAction: gleichzeitige Absendungen", () => {
  it("zweimal gleichzeitig (gueltig): genau EIN Audit, Zeitpunkte nur einmal gesetzt, das Konto bleibt", async () => {
    const u = await fresh("pobr");
    barrier.want = 2;
    barrier.seen = 0;
    barrier.gate = new Promise<void>((resolve) => {
      barrier.open = resolve;
    });
    let res: PromiseSettledResult<unknown>[];
    try {
      res = await Promise.allSettled([completeOnboardingAction(undefined, form()), completeOnboardingAction(undefined, form({ name: "Zweiter Versuch" }))]);
    } finally {
      barrier.want = 0;
    }
    expect(res.every((r) => r.status === "rejected" && String(r.reason).includes("REDIRECT:/app"))).toBe(true);
    const audits = (await db.select().from(auditLog).where(eq(auditLog.entityId, u.id))).filter((a) => a.action === "user.onboarded");
    expect(audits).toHaveLength(1);
    expect(await db.select().from(users).where(eq(users.id, u.id))).toHaveLength(1);
  });

  it("gueltig und gleichzeitig unter 16 (Datum): ein eingerichtetes Konto wird nicht mehr geloescht, ein geloeschtes nicht eingerichtet (nie beides)", async () => {
    const u = await fresh("pobq");
    await Promise.allSettled([completeOnboardingAction(undefined, form()), completeOnboardingAction(undefined, form({ birthDate: yearsAgo(10) }))]);
    const left = await db.select().from(users).where(eq(users.id, u.id));
    const audits = (await db.select().from(auditLog).where(eq(auditLog.entityId, u.id))).filter((a) => a.action === "user.onboarded");
    // entweder eingerichtet (Konto da, genau ein Audit) oder geloescht (kein Audit): nie ein geloeschtes Konto mit Audit oder ein Konto ohne Einrichtung
    if (left.length === 1) {
      expect(left[0].onboardedAt).not.toBeNull();
      expect(audits).toHaveLength(1);
    } else {
      expect(audits).toHaveLength(0);
    }
  });
});

describe("completeOnboardingAction: Sitzung und Wiederholung", () => {
  it("ohne Sitzung: Weiterleitung zur Anmeldung, nichts geschrieben", async () => {
    const u = await fresh("pobs");
    currentUserId = "";
    await expect(completeOnboardingAction(undefined, form())).rejects.toThrow("REDIRECT:/anmelden");
    expect((await row(u.id)).onboardedAt).toBeNull();
  });

  it("schon eingerichtet: nichts wird ueberschrieben (Zeitpunkte, Name, Stadt), Weiterleitung auf das Ziel, auch mit einem Datum unter 16 wird nichts geloescht", async () => {
    const u = await makeUser("pobo");
    currentUserId = u.id;
    const before = await row(u.id);
    await expect(completeOnboardingAction(undefined, form({ name: "Anderer", city: "Bochum", birthDate: yearsAgo(10), next: "/lobby/x" }))).rejects.toThrow("REDIRECT:/lobby/x");
    const after = await row(u.id);
    expect(after).toBeDefined();
    expect(after.name).toBe(before.name);
    expect(after.city).toBe(before.city);
    expect(after.termsAcceptedAt?.getTime()).toBe(before.termsAcceptedAt?.getTime());
    expect(after.onboardedAt?.getTime()).toBe(before.onboardedAt?.getTime());
    expect(signOutCalls).toHaveLength(0);
  });
});
