import { describe, expect, it } from "vitest";
import type { CardStatus } from "@/db/schema";
import { cardDisplayFor, type Audience } from "@/lib/card-visibility";
import { cardView } from "@/lib/card-view";

const ALL: CardStatus[] = ["none", "card_ready", "charge_pending", "charged", "failed"];

describe("cardDisplayFor: wer sieht welchen Kartenstatus (Vertrag 012, AC-12/AC-20)", () => {
  it("Gäste sehen gar nichts je Person, egal welcher Status", () => {
    for (const s of ALL) expect(cardDisplayFor("guest", s, "card_declined")).toBeNull();
  });
  it("der Betroffene und der Captain/Veranstalter sehen den echten Status und bei failed den Grund", () => {
    for (const a of ["self", "manager"] as Audience[]) {
      expect(cardDisplayFor(a, "failed", "card_declined")).toEqual({ status: "failed", reason: "card_declined" });
      expect(cardDisplayFor(a, "failed", null)).toEqual({ status: "failed", reason: "unknown" });
      expect(cardDisplayFor(a, "none", "card_declined")).toEqual({ status: "none", reason: null });
      expect(cardDisplayFor(a, "card_ready", null)).toEqual({ status: "card_ready", reason: null });
    }
  });
  it("Mitspieler sehen bei failed UND bei none nur dieselbe neutrale rote Ampel ohne Grund", () => {
    const failed = cardDisplayFor("member", "failed", "card_declined");
    const none = cardDisplayFor("member", "none", null);
    expect(failed).toEqual({ status: "open", reason: null });
    expect(none).toEqual(failed); // nicht unterscheidbar
    expect(cardView("open").label).toBe("Zahlung ausstehend");
    expect(cardView("failed").label).toBe("Abbuchung fehlgeschlagen"); // nur Betroffener und Captain/Veranstalter
    expect(cardView("open").tone).toBe("red");
  });
  it("Mitspieler sehen sonst den normalen Status, nie einen Grund", () => {
    for (const s of ["card_ready", "charge_pending", "charged"] as CardStatus[]) {
      expect(cardDisplayFor("member", s, "card_declined")).toEqual({ status: s, reason: null });
    }
  });
  it("die Ausgabe für Dritte enthält nie failed, den Fehlercode oder ein Fehlerwort", () => {
    for (const a of ["member", "guest"] as Audience[]) {
      for (const s of ALL) {
        const text = JSON.stringify(cardDisplayFor(a, s, "card_declined"));
        expect(text).not.toMatch(/failed|card_declined|fehlgeschlagen|abgelehnt/i);
      }
    }
  });
});
