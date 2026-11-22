import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/server/teams";

// 011 M2a-2: Die echte Server-Aktion läuft mit ersetzten Abhängigkeiten. Grund, Anmerkung und Runde müssen an answerHallRequest gehen („Grund wird mit der Ablehnung gespeichert“),
// Eingabefehler dürfen nichts aufrufen, Fristablauf und Fehler werden in neutrale Texte übersetzt (nie die Datenbankmeldung).
const answerHallRequest = vi.fn(async (..._args: unknown[]): Promise<{ status: "answered" } | { status: "late" }> => ({ status: "answered" }));
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

describe("declineHallAction (angebunden)", () => {
  beforeEach(() => {
    answerHallRequest.mockClear();
    answerHallRequest.mockResolvedValue({ status: "answered" });
  });

  it("Grund wird mit der Ablehnung weitergegeben: Kategorie, bereinigter Text und Runde", async () => {
    const { declineHallAction } = await import("@/server/matchmaking-actions");
    const r = await declineHallAction("m1", "v1", 3, undefined, form("sonstiges", "  Platz   gesperrt "));
    expect(r).toEqual({ ok: true });
    expect(answerHallRequest).toHaveBeenCalledWith("u1", "m1", "v1", false, { reasonCode: "sonstiges", reason: "Platz gesperrt", round: 3 });
  });

  it("Eingabefehler: Fehler am Feld, kein allgemeiner Alarm, KEIN Aufruf", async () => {
    const { declineHallAction } = await import("@/server/matchmaking-actions");
    const r = await declineHallAction("m1", "v1", 2, undefined, form("", ""));
    expect(r?.fieldErrors?.reasonCode).toBeTruthy();
    expect(r?.error).toBeUndefined();
    expect(answerHallRequest).not.toHaveBeenCalled();
  });

  it("zu spät: neutraler Text", async () => {
    answerHallRequest.mockResolvedValue({ status: "late" });
    const { declineHallAction } = await import("@/server/matchmaking-actions");
    const r = await declineHallAction("m1", "v1", 2, undefined, form("belegt"));
    expect(r?.error).toContain("Die Antwortfrist ist abgelaufen");
  });

  it("DomainError (schon beantwortet, veraltet): sein Text; Datenbankfehler: neutral, nie die Rohmeldung", async () => {
    const { declineHallAction } = await import("@/server/matchmaking-actions");
    answerHallRequest.mockRejectedValueOnce(new DomainError("Diese Anfrage ist schon beantwortet."));
    expect((await declineHallAction("m1", "v1", 2, undefined, form("belegt")))?.error).toBe("Diese Anfrage ist schon beantwortet.");
    answerHallRequest.mockRejectedValueOnce({ code: "EV002", message: "GEHEIMER FREITEXT" });
    const r = await declineHallAction("m1", "v1", 2, undefined, form("belegt"));
    expect(r?.error).not.toContain("GEHEIM");
    expect(r?.error).toContain("nicht geklappt");
  });

  it("Zusage: Runde wird mitgeschickt, zu spät wird übersetzt", async () => {
    const { answerHallAction } = await import("@/server/matchmaking-actions");
    expect(await answerHallAction("m1", "v1", true, 5)).toEqual({ ok: true });
    expect(answerHallRequest).toHaveBeenCalledWith("u1", "m1", "v1", true, { round: 5 });
    answerHallRequest.mockResolvedValue({ status: "late" });
    expect((await answerHallAction("m1", "v1", true, 5))?.error).toContain("abgelaufen");
  });
});
