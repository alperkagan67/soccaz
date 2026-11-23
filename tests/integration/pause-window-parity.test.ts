import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { effectiveGraceEnd } from "@/lib/grace";
import { RESUME_GRACE_MS, pausesFrom, resumeFloor, windowEndAfterResume, windowEndSql, type Pause, type ResumeInfo } from "@/server/pause-resume";
import { cleanup } from "./helpers";

// Paritaet: windowEndAfterResume (TypeScript, JS-Pruefungen) und windowEndSql (Kandidatenlisten) muessen fuer dieselben Eingaben dasselbe Fensterende liefern, auch mit MEHREREN Pausen (Schalter-Flattern).
// Grenzen: Ende == Pausenbeginn, Ende == Wiedereinschalten, Karenzende == Anstoss minus 1 Stunde (nicht angehoben), eine Millisekunde darunter (angehoben), ohne Pause.
afterAll(() => cleanup());

const H = 3_600_000;
const START = new Date("2030-01-10T20:00:00.000Z");
const ON = new Date(START.getTime() - 10 * H);
const OFF = new Date(ON.getTime() - 3 * H);
const pause = (off: Date, on: Date, until = new Date(on.getTime() + RESUME_GRACE_MS)): Pause => ({ offAt: off, onAt: on, until });
const info = (pauses: Pause[]): ResumeInfo => {
  const last = pauses.reduce((a, b) => (b.onAt.getTime() > a.onAt.getTime() ? b : a));
  return { offAt: last.offAt, onAt: last.onAt, until: last.until, pauses };
};
const P1 = pause(OFF, ON);

const cases: [string, Date, Date, ResumeInfo | null][] = [
  ["Ende in der Pause", new Date(ON.getTime() - H), START, info([P1])],
  ["Ende == Pausenbeginn (nicht in der Pause)", OFF, START, info([P1])],
  ["Ende 1 ms nach Pausenbeginn", new Date(OFF.getTime() + 1), START, info([P1])],
  ["Ende == Wiedereinschalten (noch in der Pause)", ON, START, info([P1])],
  ["Ende 1 ms nach dem Wiedereinschalten", new Date(ON.getTime() + 1), START, info([P1])],
  ["Ende lange vor der Pause", new Date(OFF.getTime() - 20 * H), START, info([P1])],
  ["Ende nach dem Wiedereinschalten", new Date(ON.getTime() + H), START, info([P1])],
  ["Karenzende == Anstoss minus 1 h (nicht angehoben)", new Date(ON.getTime() - H), START, info([pause(OFF, ON, new Date(START.getTime() - H))])],
  ["Karenzende 1 ms vor Anstoss minus 1 h (angehoben)", new Date(ON.getTime() - H), START, info([pause(OFF, ON, new Date(START.getTime() - H - 1))])],
  ["Karenzende nach Anstoss minus 1 h (nicht angehoben)", new Date(ON.getTime() - H), START, info([pause(OFF, ON, new Date(START.getTime() - 30 * 60_000))])],
  ["ohne Pause", new Date(ON.getTime() - H), START, null],
  ["ohne vollstaendige Pause (leere Liste)", new Date(ON.getTime() - H), START, { offAt: null, onAt: ON, until: new Date(ON.getTime() + RESUME_GRACE_MS), pauses: [] }],
  ["Fensterende vom Anstoss gedeckelt (Anstoss minus 1 h)", new Date(START.getTime() + 5 * H), START, info([P1])],
  // Mehrfach-Pausen (Flattern): Frist D in Pause 1, die zweite Pause liegt in der Karenz von Pause 1 und enthaelt D nicht
  ["zwei Pausen, Ende nur in Pause 1: Karenz von Pause 1 (die spaetere Pause gilt nicht)", new Date(ON.getTime() - H), START, info([P1, pause(new Date(ON.getTime() + 30 * 60_000), new Date(ON.getTime() + 40 * 60_000))])],
  ["zwei Pausen, Ende nur in Pause 2: Karenz von Pause 2", new Date(ON.getTime() + 35 * 60_000), START, info([P1, pause(new Date(ON.getTime() + 30 * 60_000), new Date(ON.getTime() + 40 * 60_000))])],
  ["zwei ueberlappende Karenzen, Ende in beiden Pausen: das spaeteste Karenzende", new Date(ON.getTime() - H), START, info([P1, pause(new Date(OFF.getTime() - H), new Date(ON.getTime() + 20 * 60_000))])],
  ["zwei Pausen, Ende vor beiden", new Date(OFF.getTime() - 30 * H), START, info([P1, pause(new Date(ON.getTime() + 30 * 60_000), new Date(ON.getTime() + 40 * 60_000))])],
];

describe("windowEndAfterResume == windowEndSql", () => {
  for (const [name, grace, start, i] of cases) {
    it(name, async () => {
      const ts = windowEndAfterResume(effectiveGraceEnd(grace, start), start, i);
      const { rows } = await db.execute<{ e: Date | string }>(sql`select ${windowEndSql(sql`${grace.toISOString()}::timestamptz`, sql`${start.toISOString()}::timestamptz`, i)} as e`);
      expect(new Date(rows[0].e).getTime()).toBe(ts!.getTime());
    });
  }
});

describe("Mehrfach-Pausen: Definition (Karenz = Maximum der Karenzenden der Pausen, in die die Frist fiel)", () => {
  const D = new Date(ON.getTime() - H);
  const flap = pause(new Date(ON.getTime() + 30 * 60_000), new Date(ON.getTime() + 40 * 60_000));
  it("D nur in Pause 1: Karenz bis on1 + 2 h (nicht on2 + 2 h)", () => {
    expect(resumeFloor(D, START, info([P1, flap])).due.getTime()).toBe(P1.until.getTime());
  });
  it("D in beiden Pausen: das spaetere Karenzende", () => {
    const wide = pause(new Date(OFF.getTime() - H), new Date(ON.getTime() + 20 * 60_000));
    expect(resumeFloor(D, START, info([P1, wide])).due.getTime()).toBe(wide.until.getTime());
  });
  it("D in keiner Pause: unveraendert", () => {
    expect(resumeFloor(new Date(OFF.getTime() - 30 * H), START, info([P1, flap])).due.getTime()).toBe(OFF.getTime() - 30 * H);
  });
  it("pausesFrom fuehrt Pausen mit Abstand unter 2 h zusammen (Karenz verkettet): off2 < on1 + 2 h <= on2 -> EINE Pause off1..on2, Karenz bis on2 + 2 h", () => {
    const t = (m: number) => new Date(Date.UTC(2030, 0, 1, 0, m));
    const p = pausesFrom([{ action: "card_switch.off", at: t(0) }, { action: "card_switch.on", at: t(60) }, { action: "card_switch.off", at: t(90) }, { action: "card_switch.on", at: t(150) }]);
    expect(p).toHaveLength(1);
    expect(p[0].offAt.getTime()).toBe(t(0).getTime());
    expect(p[0].onAt.getTime()).toBe(t(150).getTime());
    expect(p[0].until.getTime()).toBe(t(150).getTime() + RESUME_GRACE_MS);
  });
  it("pausesFrom: Abstand genau 2 h oder mehr bleibt getrennt (zwei Pausen)", () => {
    const t = (m: number) => new Date(Date.UTC(2030, 0, 1, 0, m));
    const p = pausesFrom([{ action: "card_switch.off", at: t(0) }, { action: "card_switch.on", at: t(60) }, { action: "card_switch.off", at: t(180) }, { action: "card_switch.on", at: t(200) }]); // Abstand 120 min
    expect(p).toHaveLength(2);
  });
  it("Mindestdauer: eine Pause unter 15 Minuten zaehlt nicht (14:59 verworfen, genau 15:00 zaehlt)", () => {
    const t = (m: number, sec = 0) => new Date(Date.UTC(2030, 0, 1, 0, m, sec));
    expect(pausesFrom([{ action: "card_switch.off", at: t(0) }, { action: "card_switch.on", at: t(14, 59) }])).toHaveLength(0);
    expect(pausesFrom([{ action: "card_switch.off", at: t(0) }, { action: "card_switch.on", at: t(15) }])).toHaveLength(1);
  });
  it("Reihenfolge: ERST Kurzpausen verwerfen, DANN zusammenfuehren: eine Kurzpause verlaengert die Karenz der langen Pause nicht", () => {
    const t = (m: number) => new Date(Date.UTC(2030, 0, 1, 0, m));
    const p = pausesFrom([{ action: "card_switch.off", at: t(0) }, { action: "card_switch.on", at: t(60) }, { action: "card_switch.off", at: t(70) }, { action: "card_switch.on", at: t(75) }]); // lange Pause, 10 min spaeter eine 5-min-Pause
    expect(p).toHaveLength(1);
    expect(p[0].onAt.getTime()).toBe(t(60).getTime()); // die Kurzpause (70..75) ist weg, die Karenz endet bei 60 + 2 h
    expect(p[0].until.getTime()).toBe(t(60).getTime() + RESUME_GRACE_MS);
  });
  it("pausesFrom: nur vollstaendige Paare (off dann on); ein on ohne off davor zaehlt nicht; off, off, on nimmt das letzte off", () => {
    const t = (m: number) => new Date(Date.UTC(2030, 0, 1, 0, m));
    expect(pausesFrom([{ action: "card_switch.on", at: t(1) }])).toHaveLength(0);
    expect(pausesFrom([{ action: "card_switch.off", at: t(1) }, { action: "card_switch.on", at: t(30) }, { action: "card_switch.off", at: t(40) }])).toHaveLength(1); // zweites off noch offen
    const p = pausesFrom([{ action: "card_switch.off", at: t(1) }, { action: "card_switch.off", at: t(2) }, { action: "card_switch.on", at: t(30) }]);
    expect(p).toHaveLength(1);
    expect(p[0].offAt.getTime()).toBe(t(2).getTime());
  });
});
