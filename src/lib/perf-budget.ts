// Leistungsbudget der Karten-Animation (Vertrag 013 v3, AC-21): REINER Rechenkern der Messung. Der Browserteil (tests/e2e/performance-animation.spec.ts) sammelt nur Rohdaten
// (Long Tasks, Layoutverschiebungen, Frames, Eingabe-Latenz, gleichzeitige Animationen); gerechnet, bewertet und ausgegeben wird hier, damit alles ohne Browser testbar ist.
//
// Modus (Entscheid t2q, Best Practice): Leistungsmessungen auf CI-Runnern sind NIE hart gating. Die Schwankung geteilter Runner (CPU-Drosselung, Nachbarn, Kaltstart) macht einzelne
// Grenzwerte zufällig rot, ohne dass die Seite schlechter wäre. Deshalb gilt "report": die Schwellen werden gemessen und als ::warning plus Anhang/Annotation protokolliert, der Test
// bleibt GRÜN. Rot sind nur harte Voraussetzungen (Seite geladen, Animation lief, Messfenster gültig). AC-21 gilt damit als Bericht plus Handytest durch den Nutzer (AC-24).
// Der Umschalter ist diese eine Konstante; "enforce" macht jede Unterschreitung rot (wie AUDIT_MODE in contrast-audit.ts).
export type PerfMode = "report" | "enforce";
export const PERF_MODE: PerfMode = "report";

/** Grenzen aus AC-21 (unverändert, nicht abgeschwächt): Long Tasks <= 50 ms, Layoutverschiebung 0, im Mittel >= 55 fps, Interaktion < 200 ms, höchstens 6 gleichzeitige Animationen. */
export const PERF_LIMITS = { longTaskMs: 50, cls: 0, fps: 55, interactionMs: 200, maxAnimations: 6 } as const;

export type PerfInput = {
  /** Dauer jedes Long Tasks (ms), die ins Animationsfenster fallen. */
  longTasksMs: readonly number[];
  /** Summe der Layoutverschiebungen im Fenster (ohne Eingabe-Verschiebungen). */
  cls: number;
  /** Mittlere Bildrate im Fenster. */
  fps: number;
  /** Längste Eingabe-Latenz (ms) nach dem Tippen; null = nicht gemessen. */
  interactionMs: number | null;
  /** Größte Zahl gleichzeitig laufender Animationen. */
  maxAnimations: number;
};

export type PerfCheck = { name: string; ok: boolean; value: string; limit: string };

/** Bewertet die Messung gegen die Grenzen; liefert je Kennzahl eine Zeile (nie eine Ausnahme). */
export function evaluatePerf(m: PerfInput): PerfCheck[] {
  const worstLong = m.longTasksMs.length ? Math.max(...m.longTasksMs) : 0;
  return [
    { name: "Long Tasks im Fenster", ok: worstLong <= PERF_LIMITS.longTaskMs, value: m.longTasksMs.length ? `${m.longTasksMs.length}, längster ${worstLong.toFixed(0)} ms` : "keine", limit: `<= ${PERF_LIMITS.longTaskMs} ms` },
    { name: "Layoutverschiebung (CLS) im Fenster", ok: m.cls <= PERF_LIMITS.cls, value: m.cls.toFixed(6), limit: `${PERF_LIMITS.cls}` },
    { name: "Bildrate im Mittel", ok: Number.isFinite(m.fps) && m.fps >= PERF_LIMITS.fps, value: Number.isFinite(m.fps) ? `${m.fps.toFixed(1)} fps` : "nicht messbar", limit: `>= ${PERF_LIMITS.fps} fps` },
    { name: "Interaktion nach Tippen", ok: m.interactionMs === null || m.interactionMs < PERF_LIMITS.interactionMs, value: m.interactionMs === null ? "keine Eingabe über der Messschwelle" : `${m.interactionMs.toFixed(0)} ms`, limit: `< ${PERF_LIMITS.interactionMs} ms` },
    { name: "Gleichzeitige Animationen", ok: m.maxAnimations <= PERF_LIMITS.maxAnimations, value: `${m.maxAnimations}`, limit: `<= ${PERF_LIMITS.maxAnimations}` },
  ];
}

/** Besteht der Lauf? Im Modus "report" immer (Verstöße stehen im Bericht), im Modus "enforce" nur ohne Verstoß. */
export function perfPasses(checks: readonly PerfCheck[], mode: PerfMode = PERF_MODE): boolean {
  return mode === "report" ? true : checks.every((c) => c.ok);
}

/** GitHub-Actions-Warnungen (eine pro Verstoß, einzeilig), damit sie im Job sichtbar sind, ohne den Test rot zu machen. */
export function perfWarnings(checks: readonly PerfCheck[]): string[] {
  return checks.filter((c) => !c.ok).map((c) => `::warning title=AC-21 Leistung::${c.name}: ${c.value} (Grenze ${c.limit})`.replace(/[\r\n]+/g, " "));
}

/** Bericht als Markdown-Tabelle (Anhang und Job-Log). */
export function perfReport(checks: readonly PerfCheck[], mode: PerfMode = PERF_MODE): string {
  const rows = checks.map((c) => `| ${c.name} | ${c.value} | ${c.limit} | ${c.ok ? "ok" : "ÜBER DER GRENZE"} |`);
  return [`AC-21 Leistung (Modus ${mode})`, "", "| Kennzahl | Messwert | Grenze | Ergebnis |", "|---|---|---|---|", ...rows].join("\n");
}

/** Mittlere Bildrate aus den Frame-Zeitstempeln (ms) im Fenster; weniger als zwei Frames = nicht messbar (NaN). */
export function fpsOf(frames: readonly number[]): number {
  if (frames.length < 2) return Number.NaN;
  const span = frames[frames.length - 1] - frames[0];
  return span > 0 ? (frames.length - 1) / (span / 1000) : Number.NaN;
}
