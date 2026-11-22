import { beforeEach, describe, expect, it, vi } from "vitest";

// R-T238: „Ablehnung ohne Anbindung ändert nichts“. Die echte Server-Aktion läuft mit ersetzten Abhängigkeiten; answerHallRequest darf im Zwischenstand NIE aufgerufen werden.
const answerHallRequest = vi.fn(async () => undefined);
vi.mock("@/server/session", () => ({ requireUser: async () => ({ id: "u1" }) }));
vi.mock("@/server/veto", () => ({ answerHallRequest, banHall: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/server/matchmaking", () => ({ acceptSearch: vi.fn(), joinQueue: vi.fn(), leaveQueue: vi.fn(), setOpenLobbyJoined: vi.fn() }));
vi.mock("@/server/scheduling", () => ({ proposeOption: vi.fn(), voteOption: vi.fn(), withdrawOption: vi.fn() }));
vi.mock("@/server/challenges", () => ({ acceptChallenge: vi.fn(), challengeTeam: vi.fn(), declineChallenge: vi.fn() }));
vi.mock("@/db", () => ({ db: {} }));

const form = (code: string, text = "") => {
  const fd = new FormData();
  if (code) fd.set("reasonCode", code);
  fd.set("reason", text);
  return fd;
};

describe("declineHallAction ohne Anbindung (Zwischenstand 011 M2b)", () => {
  beforeEach(() => answerHallRequest.mockClear());

  it("gültige Eingabe: Meldung „Ablehnen mit Grund folgt“, answerHallRequest wird NICHT aufgerufen, nichts geschrieben", async () => {
    const { declineHallAction } = await import("@/server/matchmaking-actions");
    const r = await declineHallAction("m1", "v1", undefined, form("belegt", ""));
    expect(r).toEqual({ error: expect.stringContaining("Ablehnen mit Grund folgt") });
    expect(answerHallRequest).not.toHaveBeenCalled();
  });

  it("Eingabefehler: Fehler am Feld, ebenfalls kein Aufruf", async () => {
    const { declineHallAction } = await import("@/server/matchmaking-actions");
    const r = await declineHallAction("m1", "v1", undefined, form("", ""));
    expect(r?.fieldErrors?.reasonCode).toBeTruthy();
    expect(r?.error).toBeUndefined(); // kein zweiter allgemeiner Alarm neben dem Feldfehler
    expect(answerHallRequest).not.toHaveBeenCalled();
  });
});
