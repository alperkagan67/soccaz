import { describe, expect, it } from "vitest";
import { SWITCH_TEXTS, cleanSwitchReason, normalizeState, planSwitch } from "@/lib/evidence-switch";

// 011 M2a: Prüfung der Schalter „Uhrenquelle auf Datenbank“ und „Beweispflicht einschalten“ (reine Funktion).
const off = { enforcement: "off", clockSource: "js" };
const offDb = { enforcement: "off", clockSource: "db" };
const onDb = { enforcement: "on", clockSource: "db" };

describe("planSwitch", () => {
  it("Uhrenquelle auf Datenbank: mit Grund erlaubt", () => {
    expect(planSwitch("clock_db", off, "Anwendung nutzt Datenbankzeit")).toEqual({ kind: "go", key: "evidence_clock_source", value: "db", reason: "Anwendung nutzt Datenbankzeit" });
  });
  it("Beweispflicht ein: nur bei Uhrenquelle Datenbank", () => {
    expect(planSwitch("enforcement_on", off, "Go-live")).toEqual({ kind: "invalid", error: SWITCH_TEXTS.needClock });
    expect(planSwitch("enforcement_on", offDb, "Go-live")).toEqual({ kind: "go", key: "evidence_enforcement", value: "on", reason: "Go-live" });
  });
  it("schon erledigt: abgelehnt, nichts doppelt", () => {
    expect(planSwitch("clock_db", onDb, "Grund").kind).toBe("invalid");
    expect(planSwitch("enforcement_on", onDb, "Grund")).toEqual({ kind: "invalid", error: SWITCH_TEXTS.alreadyOn });
  });
  it("Grund Pflicht: leer, zu kurz, zu lang, nur Steuerzeichen", () => {
    for (const r of [null, undefined, "", "  ", "ab", "x".repeat(201), "​​​\u0001"]) expect(planSwitch("clock_db", off, r)).toEqual({ kind: "invalid", error: SWITCH_TEXTS.reason });
    expect(planSwitch("clock_db", off, "x".repeat(200)).kind).toBe("go");
  });
  it("unbekannter Schritt (auch „ausschalten“): abgelehnt", () => {
    for (const s of ["enforcement_off", "clock_js", "", null, 3]) expect(planSwitch(s, onDb, "Grund")).toEqual({ kind: "invalid", error: SWITCH_TEXTS.unknown });
  });
  it("fehlende Werte gelten fail-closed: Durchsetzung an, Uhrenquelle nicht Datenbank", () => {
    expect(normalizeState({})).toEqual({ enforcementOn: true, clockDb: false });
    expect(normalizeState({ enforcement: "OFF" }).enforcementOn).toBe(false);
    expect(normalizeState({ enforcement: "ofF ", clockSource: "DB" })).toEqual({ enforcementOn: true, clockDb: false });
  });
  it("Bereinigung: Leerraum zusammen, Zero-Width weg", () => {
    expect(cleanSwitchReason("  a​b \n  c ")).toBe("ab c");
  });
});
