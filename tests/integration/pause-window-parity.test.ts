import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { effectiveGraceEnd } from "@/lib/grace";
import { RESUME_GRACE_MS, windowEndAfterResume, windowEndSql, type ResumeInfo } from "@/server/pause-resume";
import { cleanup } from "./helpers";

// Paritaet: windowEndAfterResume (TypeScript, JS-Pruefungen) und windowEndSql (Kandidatenlisten) muessen fuer dieselben Eingaben dasselbe Fensterende liefern. Grenzen: Ende == Pausenbeginn, Ende == Wiedereinschalten,
// Karenzende == Anstoss minus 1 Stunde (nicht angehoben), eine Millisekunde darunter (angehoben), ohne Pausenbeginn, ohne Pause.
afterAll(() => cleanup());

const H = 3_600_000;
const START = new Date("2030-01-10T20:00:00.000Z");
const ON = new Date(START.getTime() - 10 * H);
const OFF = new Date(ON.getTime() - 3 * H);
const info = (over: Partial<ResumeInfo> = {}): ResumeInfo => ({ offAt: OFF, onAt: ON, until: new Date(ON.getTime() + RESUME_GRACE_MS), ...over });

const cases: [string, Date, Date, ResumeInfo | null][] = [
  ["Ende in der Pause", new Date(ON.getTime() - H), START, info()],
  ["Ende == Pausenbeginn (nicht in der Pause)", OFF, START, info()],
  ["Ende 1 ms nach Pausenbeginn", new Date(OFF.getTime() + 1), START, info()],
  ["Ende == Wiedereinschalten (noch in der Pause)", ON, START, info()],
  ["Ende 1 ms nach dem Wiedereinschalten", new Date(ON.getTime() + 1), START, info()],
  ["Ende lange vor der Pause", new Date(OFF.getTime() - 20 * H), START, info()],
  ["Ende nach dem Wiedereinschalten", new Date(ON.getTime() + H), START, info()],
  ["Karenzende == Anstoss minus 1 h (nicht angehoben)", new Date(ON.getTime() - H), START, info({ until: new Date(START.getTime() - H) })],
  ["Karenzende 1 ms vor Anstoss minus 1 h (angehoben)", new Date(ON.getTime() - H), START, info({ until: new Date(START.getTime() - H - 1) })],
  ["Karenzende nach Anstoss minus 1 h (nicht angehoben)", new Date(ON.getTime() - H), START, info({ until: new Date(START.getTime() - 30 * 60_000) })],
  ["ohne Pausenbeginn", new Date(ON.getTime() - H), START, info({ offAt: null })],
  ["ohne Pause", new Date(ON.getTime() - H), START, null],
  ["Fensterende vom Anstoss gedeckelt (Anstoss minus 1 h)", new Date(START.getTime() + 5 * H), START, info()],
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
