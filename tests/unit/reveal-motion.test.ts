import { describe, expect, it } from "vitest";
import { REVEAL_STORAGE_KEY, decideMotion, type TierStorage } from "@/lib/reveal-motion";

// Vertrag 013 v3, AC-20: "bei Aufstieg einmalige Aufstiegs-Animation, danach nicht mehr"; Merker nur im Browser, kein Serverzustand, nie ein Fehler.
const memory = (initial?: string): TierStorage & { value: string | null; writes: number } => {
  const s = {
    value: initial ?? null,
    writes: 0,
    getItem: (k: string) => (k === REVEAL_STORAGE_KEY ? s.value : null),
    setItem: (k: string, v: string) => {
      if (k === REVEAL_STORAGE_KEY) {
        s.value = v;
        s.writes += 1;
      }
    },
  };
  return s;
};

describe("decideMotion (Merker soccaz.maxTier)", () => {
  it("erster Aufstieg: feiern und die Stufe merken; derselbe Besuch danach (Neuladen): nicht mehr", () => {
    const st = memory();
    expect(decideMotion(st, "rasen", "up")).toEqual({ celebrate: true });
    expect(st.value).toBe("rasen");
    expect(decideMotion(st, "rasen", "up")).toEqual({ celebrate: false });
    expect(st.writes).toBe(1);
  });

  it("neuer, höherer Höchststand feiert wieder; eine niedrigere oder gleiche Stufe nie", () => {
    const st = memory("rasen");
    expect(decideMotion(st, "flutlicht", "up")).toEqual({ celebrate: true });
    expect(st.value).toBe("flutlicht");
    expect(decideMotion(st, "rasen", "up")).toEqual({ celebrate: false }); // Hin und Her an der Grenze löst nicht mehrfach aus
    expect(st.value).toBe("flutlicht");
  });

  it("gleiche Stufe und gesunkene Stufe: keine Feier, der Merker bleibt unverändert (Entscheid TM)", () => {
    const st = memory("pokal");
    expect(decideMotion(st, "pokal", "same")).toEqual({ celebrate: false });
    expect(decideMotion(st, "rasen", "down")).toEqual({ celebrate: false });
    expect(st.value).toBe("pokal");
    expect(st.writes).toBe(0);
  });

  it("die Richtung entscheidet, nicht nur der Höchststand: 'gleich' oder 'gesunken' feiert auch bei leerem oder niedrigerem Merker nie und schreibt nichts", () => {
    const empty = memory();
    expect(decideMotion(empty, "rasen", "same")).toEqual({ celebrate: false });
    expect(decideMotion(empty, "rasen", "down")).toEqual({ celebrate: false });
    expect(empty.value).toBeNull();
    expect(empty.writes).toBe(0);
    const low = memory("kreide");
    expect(decideMotion(low, "flutlicht", "down")).toEqual({ celebrate: false });
    expect(low.value).toBe("kreide");
  });

  it("ohne nutzbaren Speicher nie feiern und nie ein Fehler: null, Lesen wirft, Schreiben wirft", () => {
    expect(decideMotion(null, "rasen", "up")).toEqual({ celebrate: false });
    expect(decideMotion(undefined, "rasen", "up")).toEqual({ celebrate: false });
    const readThrows: TierStorage = { getItem: () => { throw new Error("gesperrt"); }, setItem: () => undefined };
    expect(decideMotion(readThrows, "rasen", "up")).toEqual({ celebrate: false });
    const writeThrows: TierStorage = { getItem: () => null, setItem: () => { throw new Error("voll"); } };
    expect(decideMotion(writeThrows, "rasen", "up")).toEqual({ celebrate: false });
  });

  it("Müll im Speicher zählt wie 'noch nie gezeigt' (kein Absturz, kein falscher Vergleich)", () => {
    for (const junk of ["", "x", "__proto__", "constructor", "ROSEN", "5", "null"]) {
      const st = memory(junk);
      expect(decideMotion(st, "rasen", "up"), junk).toEqual({ celebrate: true });
      expect(st.value).toBe("rasen");
    }
  });

  it("der Merker enthält nur einen Stufennamen, keine Person und keine Spiel-ID", () => {
    const st = memory();
    decideMotion(st, "legende", "up");
    expect(st.value).toBe("legende");
    expect(REVEAL_STORAGE_KEY).toBe("soccaz.maxTier");
  });
});
