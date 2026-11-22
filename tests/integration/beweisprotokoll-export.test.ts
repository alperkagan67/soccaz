import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookingEvidence, bookingEvidenceCounter, evidenceActor, venues } from "@/db/schema-finance";
import { verifyNdjson } from "../../scripts/lib/evidence-chain.mjs";
import { GET as chainExport } from "@/app/api/beweis/kette/route";
import { GET as evidencePdf } from "@/app/api/beweis/[matchId]/route";
import { listEvidenceMatches, loadMatchEvidence } from "@/server/evidence-export";
import { recordEvidence } from "@/server/evidence-write";
import { cleanup, makeMatch, makeUser } from "./helpers";

// UNGETESTET gegen die Datenbank (Entwurf, Vertrag 009 M3c, Plan 3.6/12 e): PDF-Abruf, Gesamtketten-Export, externe Prüfung. Nur die Anmeldung ist ersetzt.
let currentUserId = "";
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: currentUserId } }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const maintenance = (fn: (tx: Tx) => Promise<unknown>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('socaz.ledger_maintenance', 'on', true)`);
    await fn(tx);
  });
async function resetChain() {
  await maintenance(async (tx) => {
    await tx.delete(evidenceActor);
    await tx.delete(bookingEvidence);
    await tx.update(bookingEvidenceCounter).set({ lastSeq: 0, lastHash: "" }).where(eq(bookingEvidenceCounter.id, 1));
  });
}
beforeEach(async () => {
  await cleanup();
  await resetChain();
  currentUserId = "";
});
afterAll(async () => {
  await cleanup();
  await resetChain();
});

let n = 0;
async function setup() {
  const m = await makeMatch({ hoursAhead: 72 });
  const [v] = await db.insert(venues).values({ name: `E2E Export Halle ${Date.now().toString(36)}${++n}`, city: "Essen", source: "manual" }).returning();
  return { matchId: m.match.id, venueId: v.id, home: m.home.name, away: m.away.name };
}
const rec = (matchId: string, venueId: string | null, kind: Parameters<typeof recordEvidence>[1]["kind"], extra: Partial<Parameters<typeof recordEvidence>[1]> = {}) =>
  db.transaction((tx) => recordEvidence(tx, { matchId, venueId, round: 1, kind, ...extra }));
const callPdf = (id: string) => evidencePdf(new Request("http://localhost/api/beweis/x"), { params: Promise.resolve({ matchId: id }) } as never);
const callChain = () => chainExport();

describe("Gesamtketten-Export und externe Prüfung (Plan 12 e)", () => {
  it("Admin 1 bekommt die Kette als NDJSON; die externe JS-Prüfung rechnet die echten Hashes der Datenbank nach (Sonderzeichen, Unicode, Zeilenumbruch); Kopf-Hash = Zähler", async () => {
    const s = await setup();
    const op = await makeUser("exportop");
    await rec(s.matchId, s.venueId, "request_sent");
    await rec(s.matchId, s.venueId, "declined", { reason: "Halle belegt | Training; Zeile2\nÜnïcödé 😀", actor: { userId: op.id, name: op.name, email: op.email } });
    await rec(s.matchId, null, "job_open");
    const owner = await makeUser("exportowner", "owner");
    currentUserId = owner.id;
    const res = await callChain();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("ndjson");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = await res.text();
    const [counter] = await db.select().from(bookingEvidenceCounter);
    expect(verifyNdjson(body, { headHash: counter.lastHash, count: counter.lastSeq })).toMatchObject({ ok: true, count: 3 });
    expect(body).not.toContain(op.email); // keine Personenfelder im Export
    expect(body).not.toContain(op.name);
  });

  it("eine geänderte Zeile (Wartungsausnahme in der Datenbank) wird in der externen Prüfung des NEUEN Exports an der richtigen seq erkannt, wenn der extern abgelegte Kopf-Hash bekannt ist", async () => {
    const s = await setup();
    await rec(s.matchId, s.venueId, "request_sent");
    await rec(s.matchId, s.venueId, "accepted");
    const owner = await makeUser("exportowner2", "owner");
    currentUserId = owner.id;
    const before = await (await callChain()).text();
    const external = verifyNdjson(before); // extern abgelegt: Kopf-Hash und Anzahl
    await maintenance((tx) => tx.update(bookingEvidence).set({ kind: "declined" }).where(eq(bookingEvidence.seq, 2)));
    const after = await (await callChain()).text();
    expect(verifyNdjson(after)).toMatchObject({ ok: false, firstBadSeq: 2, reason: "hash" });
    expect(verifyNdjson(before, { headHash: external.headHash, count: external.count }).ok).toBe(true);
  });

  it("nur Admin 1: Admin 2, Spieler und Gast bekommen 404 (kein Hinweis, dass es die Route gibt)", async () => {
    const admin2 = await makeUser("exportadm", "admin");
    const player = await makeUser("exportpl", "player");
    for (const id of [admin2.id, player.id, ""]) {
      currentUserId = id;
      const r = await callChain();
      expect(r.status).toBe(404);
      expect(r.headers.get("cache-control")).toBe("private, no-store");
    }
  });
});

describe("PDF je Spiel (Plan 3.6)", () => {
  it("Admin 1 bekommt ein gültiges PDF (auch mit Sonderzeichen/Pseudo-Markup in der Begründung); Admin 2, Betreiber, Spieler, Gast, unbekannte und ungültige ID: dieselbe 404-Antwort", async () => {
    const s = await setup();
    await rec(s.matchId, s.venueId, "request_sent");
    await rec(s.matchId, s.venueId, "declined", { reason: "<b>fett</b> **x** [link](http://evil.invalid) ‮ Ünï 😀" });
    const owner = await makeUser("pdfowner", "owner");
    currentUserId = owner.id;
    const ok = await callPdf(s.matchId);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("application/pdf");
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
    expect(ok.headers.get("content-disposition")).toMatch(/^inline; filename="beweis-[\w-]+\.pdf"$/);
    expect(Buffer.from(await ok.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");

    const admin2 = await makeUser("pdfadm", "admin");
    const player = await makeUser("pdfpl", "player");
    const bodies = new Set<string>();
    for (const [id, target] of [[admin2.id, s.matchId], [player.id, s.matchId], ["", s.matchId], [owner.id, "00000000-0000-4000-8000-000000000000"], [owner.id, "kein-uuid"]] as const) {
      currentUserId = id;
      const r = await callPdf(target);
      expect(r.status, `${id || "Gast"} ${target}`).toBe(404);
      expect(r.headers.get("cache-control")).toBe("private, no-store");
      bodies.add(await r.text());
    }
    expect(bodies.size).toBe(1); // gleiche Antwort für fremd, unbekannt und ungültig
  });

  it("loadMatchEvidence: Hallenname und (nur hier, für Admin 1) der Name des Betreibers; keine Team- und Spielernamen; unbekanntes Spiel und Spiel ohne Einträge = null", async () => {
    const s = await setup();
    const op = await makeUser("pdfop");
    await rec(s.matchId, s.venueId, "accepted", { actor: { userId: op.id, name: op.name, email: op.email } });
    const data = (await loadMatchEvidence(s.matchId))!;
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].actorName).toBe(op.name);
    expect(data.entries[0].venueName).toContain("E2E Export Halle");
    expect(JSON.stringify(data)).not.toContain(s.home);
    expect(JSON.stringify(data)).not.toContain(s.away);
    expect(data.report.chain.ok).toBe(true);
    expect(await loadMatchEvidence("00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await loadMatchEvidence("kein-uuid")).toBeNull();
  });

  it("listEvidenceMatches: Spiele mit Einträgen, neueste zuerst, mit Anzahl", async () => {
    const a = await setup();
    const b = await setup();
    await rec(a.matchId, a.venueId, "request_sent");
    await rec(b.matchId, b.venueId, "request_sent");
    await rec(b.matchId, b.venueId, "accepted");
    const rows = await listEvidenceMatches();
    expect(rows.map((r) => [r.matchId, r.entries])).toEqual([[b.matchId, 2], [a.matchId, 1]]);
  });
});
