import { describe, expect, it } from "vitest";
import { abortDeadline, dueReminders, dueWithGrace, fixDeadline, hasLongLead, hasMinLead, joinClosedByTime, leaveClosedByTime, lobbyDeadline } from "@/lib/deadlines";

const h = (n: number) => n * 3_600_000;

describe("Lobby-Frist", () => {
  it("normalerweise 24 Stunden vor Anstoß", () => {
    const starts = new Date("2026-11-10T20:00:00Z");
    const created = new Date("2026-11-01T10:00:00Z");
    expect(lobbyDeadline(starts, created).toISOString()).toBe("2026-11-09T20:00:00.000Z");
  });
  it("kurz vor Anstoß angenommen: mindestens 12 Stunden Zeit", () => {
    const starts = new Date("2026-11-10T20:00:00Z");
    const created = new Date(starts.getTime() - h(25)); // Annahme 25 Stunden vorher
    expect(lobbyDeadline(starts, created).getTime()).toBe(created.getTime() + h(12));
  });
});

describe("Erinnerungen", () => {
  const starts = new Date("2026-11-10T20:00:00Z");
  const at = (hoursBefore: number) => new Date(starts.getTime() - h(hoursBefore));
  it("noch nichts fällig", () => expect(dueReminders(starts, at(48))).toEqual([]));
  it("24 Stunden vorher", () => expect(dueReminders(starts, at(23))).toEqual(["24h"]));
  it("2 Stunden vorher: dringendste zuerst", () => expect(dueReminders(starts, at(1.5))).toEqual(["2h", "24h"]));
  it("30 Minuten vorher", () => expect(dueReminders(starts, at(0.4))).toEqual(["30m", "2h", "24h"]));
  it("nach Anstoß keine", () => expect(dueReminders(starts, new Date(starts.getTime() + 1))).toEqual([]));
});

describe("Frist-Regel 48 h / 1 h (feste Uhren)", () => {
  const start = new Date("2026-03-10T20:00:00Z");
  it("langer Vorlauf bei der Anlage ab genau 48 Stunden", () => {
    expect(hasLongLead(start, new Date("2026-03-08T20:00:00Z"))).toBe(true); // genau 48 h
    expect(hasLongLead(start, new Date("2026-03-08T20:00:01Z"))).toBe(false); // eine Sekunde weniger
    expect(hasLongLead(start, new Date("2026-03-01T00:00:00Z"))).toBe(true);
  });
  it("Frist ist Anstoß minus 48 Stunden, Abbruch Anstoß minus 1 Stunde", () => {
    expect(fixDeadline(start).toISOString()).toBe("2026-03-08T20:00:00.000Z");
    expect(abortDeadline(start).toISOString()).toBe("2026-03-10T19:00:00.000Z");
  });
  it("Beitritt: mit langem Vorlauf ab der Frist zu, mit kurzem Vorlauf nie durch die Zeit", () => {
    const longCreated = new Date("2026-03-01T00:00:00Z");
    expect(joinClosedByTime(start, longCreated, new Date("2026-03-08T19:59:59Z"))).toBe(false);
    expect(joinClosedByTime(start, longCreated, new Date("2026-03-08T20:00:00Z"))).toBe(true);
    const shortCreated = new Date("2026-03-09T20:00:00Z"); // 24 h Vorlauf
    expect(joinClosedByTime(start, shortCreated, new Date("2026-03-10T19:30:00Z"))).toBe(false);
  });
  it("Austritt: ab 48 Stunden vor Anstoß gesperrt (kurzer Vorlauf liegt immer darin)", () => {
    expect(leaveClosedByTime(start, new Date("2026-03-08T19:59:59Z"))).toBe(false);
    expect(leaveClosedByTime(start, new Date("2026-03-08T20:00:00Z"))).toBe(true); // genau 48 h: wie der Beitritt zu
    expect(leaveClosedByTime(start, new Date("2026-03-08T20:00:01Z"))).toBe(true);
    expect(leaveClosedByTime(start, new Date("2026-03-09T20:00:00Z"))).toBe(true);
  });
});

describe("Karenz und Mindestvorlauf (feste Uhren)", () => {
  const start = new Date("2026-03-10T20:00:00Z");
  it("Karenz: die Frist liegt frühestens 12 Stunden nach dem Zeitpunkt, ab dem gezahlt werden kann, aber nie näher als 15 Minuten vor Anstoß", () => {
    // Zahlen ab 5 Stunden vor Anstoß: die Karenz reicht über den Anstoß hinaus, die Frist ist 15 Minuten vor Anstoß
    expect(dueWithGrace(abortDeadline(start), new Date("2026-03-10T15:00:00Z"), start).toISOString()).toBe("2026-03-10T19:45:00.000Z");
    // 24 Stunden Vorlauf: die Karenz ist längst abgelaufen, der Abbruch bleibt 1 Stunde vor Anstoß
    expect(dueWithGrace(abortDeadline(start), new Date("2026-03-09T20:00:00Z"), start).toISOString()).toBe("2026-03-10T19:00:00.000Z");
    // 50 Stunden Vorlauf: die 48-h-Frist läge 2 Stunden nach dem Start der Zahlung, die Karenz schiebt sie auf 12 Stunden danach
    expect(dueWithGrace(fixDeadline(start), new Date("2026-03-08T18:00:00Z"), start).toISOString()).toBe("2026-03-09T06:00:00.000Z");
  });
  it("Mindestvorlauf: genau eine Stunde ist erlaubt, eine Millisekunde weniger nicht", () => {
    const now = new Date("2026-03-10T19:00:00Z");
    expect(hasMinLead(start, now)).toBe(true);
    expect(hasMinLead(start, new Date(now.getTime() + 1))).toBe(false);
  });
});
