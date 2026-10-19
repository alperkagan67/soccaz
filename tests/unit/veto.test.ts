import { describe, expect, it } from "vitest";
import { buildPool, totalBans, turnOf, vetoDone, type PoolVenue } from "@/lib/veto";

const v = (id: string, city: string, over: Partial<PoolVenue> = {}): PoolVenue => ({ id, name: id, city, lat: null, lng: null, partner: false, verified: true, ...over });

describe("Hallen-Veto", () => {
  it("Banns wechseln sich ab, am Ende bleibt eine Halle", () => {
    expect(totalBans(7)).toBe(6);
    expect(totalBans(1)).toBe(0);
    expect([0, 1, 2, 3, 4, 5].map((n) => turnOf(n, "A", "B"))).toEqual(["A", "B", "A", "B", "A", "B"]);
    expect(vetoDone(2)).toBe(false);
    expect(vetoDone(1)).toBe(true);
  });

  it("Pool: Hallen der Stadt zuerst (Partner, geprüft, Name), höchstens 7", () => {
    const all = [v("Z-Halle", "Essen"), v("A-Halle", "Essen"), v("Partner", "Essen", { partner: true }), v("Ungeprüft", "Essen", { verified: false }), ...Array.from({ length: 8 }, (_, i) => v(`Fern${i}`, "Köln"))];
    const pool = buildPool(all, "Essen");
    expect(pool).toHaveLength(7);
    expect(pool.slice(0, 4).map((x) => x.id)).toEqual(["Partner", "A-Halle", "Z-Halle", "Ungeprüft"]);
  });

  it("Pool füllt mit den nächstgelegenen Hallen aus anderen Städten auf", () => {
    const all = [
      v("Essen1", "Essen", { lat: 51.45, lng: 7.01 }),
      v("Bochum", "Bochum", { lat: 51.48, lng: 7.22 }), // ca. 15 km
      v("Köln", "Köln", { lat: 50.94, lng: 6.96 }), // ca. 60 km
      v("Münster", "Münster", { lat: 51.96, lng: 7.63 }), // ca. 70 km
      v("Aachen", "Aachen", { lat: 50.78, lng: 6.08 }), // ca. 110 km
    ];
    expect(buildPool(all, "Essen", 4).map((x) => x.id)).toEqual(["Essen1", "Bochum", "Köln", "Münster"]);
  });

  it("Stadt ohne eigene Hallen oder ohne Koordinaten: Reihenfolge nach Güte und Name", () => {
    const all = [v("B", "Köln"), v("A", "Bonn", { partner: true }), v("C", "Aachen", { verified: false })];
    expect(buildPool(all, "Andere (NRW)").map((x) => x.id)).toEqual(["A", "B", "C"]);
    expect(buildPool([], "Essen")).toEqual([]);
  });
});
