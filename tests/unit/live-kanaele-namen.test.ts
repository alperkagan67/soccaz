import { beforeEach, describe, expect, it, vi } from "vitest";

// AC-17 (Entscheid t2q 2026-11-24), PR C: Live-Kanäle ohne Anmeldung liefern keine Personennamen: das öffentliche Spielstand-JSON nur Initialen, die SSE-Kanäle nur "update" ohne Nutzdaten.
const NAME = "Zorro Vollname";
const page = vi.hoisted(() => ({
  value: null as unknown,
}));
vi.mock("@/server/results", () => ({ getMatchPage: async () => page.value }));
const subscribers = vi.hoisted(() => ({ cbs: [] as Array<() => void> }));
vi.mock("@/server/realtime", () => ({
  ALL_MATCHES: "all",
  subscribeToLobby: async (_id: string, cb: () => void) => {
    subscribers.cbs.push(cb);
    return () => undefined;
  },
}));

const matchPage = (visibility = "public") => ({
  match: { id: "m1", status: "played", startsAt: new Date("2026-11-20T18:00:00Z"), durationMin: 60, homeName: "Heim", awayName: "Gast", homeId: "h", awayId: "a", visibility },
  live: { home: 2, away: 0 },
  result: null,
  phase: "finished",
  events: [
    { type: "goal", minute: 5, teamId: "h", scorer: NAME, userId: "11111111-2222-3333-4444-555555555555" },
    { type: "goal", minute: 9, teamId: "h", scorer: null, userId: null },
    { type: "yellow_card", minute: 12, teamId: "a", scorer: "Gegner Beispiel", userId: "u2" },
  ],
});

describe("/api/spiele/[id]/live (öffentliches JSON)", () => {
  beforeEach(() => {
    page.value = matchPage();
  });
  async function abrufen() {
    const { GET } = await import("@/app/api/spiele/[id]/live/route");
    const res = await GET(new Request("http://x/api/spiele/m1/live"), { params: Promise.resolve({ id: "m1" }) } as never);
    return { res, text: await res.text() };
  }
  it("Torschützen nur als Initialen, weder Name noch Kennung noch Nachname im Text", async () => {
    const { res, text } = await abrufen();
    expect(res.status).toBe(200);
    const json = JSON.parse(text);
    expect(json.goals).toEqual([
      { minute: 5, team: "home", player: "ZV" },
      { minute: 9, team: "home", player: null },
    ]);
    expect(text).not.toContain("Zorro");
    expect(text).not.toContain("Vollname");
    expect(text).not.toContain("11111111-2222");
    expect(text).not.toContain("Gegner");
  });
  it("Spielstand und Teamnamen bleiben (Teamnamen sind keine Personennamen); nicht öffentliche Spiele geben nichts preis", async () => {
    const { text } = await abrufen();
    expect(JSON.parse(text)).toMatchObject({ home: { name: "Heim", score: 2 }, away: { name: "Gast", score: 0 } });
    page.value = matchPage("private");
    const privat = await abrufen();
    expect(privat.res.status).toBe(404);
    expect(privat.text).not.toContain("Zorro");
  });
});

describe("SSE-Kanäle (createMatchStream): nur 'update', keine Nutzdaten", () => {
  async function lesen(matchId: string) {
    const { createMatchStream } = await import("@/server/sse");
    const ctrl = new AbortController();
    const res = createMatchStream(new Request("http://x/events", { signal: ctrl.signal }), matchId);
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let text = dec.decode((await reader.read()).value);
    subscribers.cbs.at(-1)?.(); // ein Ereignis (z. B. ein Tor) wird gemeldet
    text += dec.decode((await reader.read()).value);
    ctrl.abort();
    return text;
  }
  for (const kanal of ["m1", "all"]) {
    it(`Kanal ${kanal}: Verbindungsgruß und "event: update / data: 1", sonst nichts`, async () => {
      const text = await lesen(kanal);
      expect(text).toContain("event: update");
      expect(text).toContain("data: 1");
      expect(text.replace(/retry: 3000|: verbunden|event: update|data: 1|\s/g, "")).toBe("");
      expect(text).not.toContain("Zorro");
    });
  }
});
