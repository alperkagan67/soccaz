import { describe, expect, it } from "vitest";
import { HALL_TEXTS, describeHallDbFailure, pgCodeOf } from "@/lib/hall-answer-errors";
import { HALL_REPLY_MAX_MS, hallReplyDeadline } from "@/lib/hall-deadline";

// 011 M2: Antwortfrist min(12 h, Anstoß − 1 h) und Übersetzung der Datenbankfehler (reine Funktionen, ohne Datenbank).
const now = new Date("2026-11-22T12:00:00Z");
const at = (ms: number) => new Date(now.getTime() + ms);
const H = 3_600_000;

describe("hallReplyDeadline (P9, P11)", () => {
  it("Vorlauf 30 h: 12 Stunden", () => {
    expect(hallReplyDeadline(at(30 * H), now)).toEqual(at(HALL_REPLY_MAX_MS));
  });
  it("Vorlauf 5 h: Anstoß minus 1 Stunde, nie nach dem Anstoß", () => {
    const d = hallReplyDeadline(at(5 * H), now)!;
    expect(d).toEqual(at(4 * H));
    expect(d.getTime()).toBeLessThan(at(5 * H).getTime());
  });
  it("Grenze 13 h: beide gleich (12 h)", () => {
    expect(hallReplyDeadline(at(13 * H), now)).toEqual(at(12 * H));
  });
  it("Vorlauf knapp über 1 Stunde: kurzes Fenster; genau 1 Stunde oder weniger: kein Fenster (null)", () => {
    expect(hallReplyDeadline(at(H + 60_000), now)).toEqual(at(60_000));
    expect(hallReplyDeadline(at(H), now)).toBeNull();
    expect(hallReplyDeadline(at(40 * 60_000), now)).toBeNull();
    expect(hallReplyDeadline(at(-H), now)).toBeNull();
  });
  it("die Frist liegt immer vor dem Anstoß und höchstens 12 Stunden voraus", () => {
    for (const lead of [2 * H, 6 * H, 12.5 * H, 13 * H, 48 * H, 200 * H]) {
      const d = hallReplyDeadline(at(lead), now)!;
      expect(d.getTime()).toBeLessThan(at(lead).getTime());
      expect(d.getTime() - now.getTime()).toBeLessThanOrEqual(HALL_REPLY_MAX_MS);
    }
  });
});

describe("describeHallDbFailure (Datenbank-Fehlercodes → neutrale Texte, nie die Datenbankmeldung)", () => {
  it("EV001 zu spät, EV004 kein Zugang, EV002/EV003/unbekannt technisch", () => {
    expect(describeHallDbFailure({ code: "EV001", message: "Antwortfrist abgelaufen." })).toEqual({ kind: "late", text: HALL_TEXTS.late });
    expect(describeHallDbFailure({ code: "EV004" }).kind).toBe("no-access");
    expect(describeHallDbFailure({ code: "EV002", message: "Begruendung: geheimer Freitext" })).toEqual({ kind: "form", text: HALL_TEXTS.technical });
    expect(describeHallDbFailure({ code: "EV003" }).kind).toBe("technical");
    expect(describeHallDbFailure(new Error("irgendwas")).kind).toBe("technical");
    expect(describeHallDbFailure(null).kind).toBe("technical");
  });
  it("findet den Code auch im eingepackten Fehler (cause)", () => {
    expect(pgCodeOf({ message: "Failed query", cause: { code: "EV001" } })).toBe("EV001");
    expect(describeHallDbFailure({ cause: { cause: { code: "EV004" } } }).kind).toBe("no-access");
  });
  it("gibt keinen Freitext aus der Datenbankmeldung weiter", () => {
    for (const code of ["EV001", "EV002", "EV003", "EV004", "X"]) {
      expect(describeHallDbFailure({ code, message: "SECRET-FREITEXT" }).text).not.toContain("SECRET");
    }
  });
});
