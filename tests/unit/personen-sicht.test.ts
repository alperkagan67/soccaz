import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PersonName } from "@/components/PersonName";
import { autorLabel, personRef, vornameInitial, type LobbySicht } from "@/lib/lobby-namen";

// AC-17 (Entscheid t2q 2026-11-24), PR B: Personen in öffentlichen Listen: Name und Link nur für Angemeldete; Gast und reiner Betreiber Initialen ohne Link, und der Listenschlüssel trägt keine Kennung (React-Schlüssel stehen in der RSC-Nutzlast).
const ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const NAME = "Zorro Vollname";

describe("personRef", () => {
  it("Angemeldete: Name, Link auf das Profil, Kennung als Schlüssel", () => {
    expect(personRef("member", ID, NAME, 3)).toEqual({ key: ID, label: NAME, href: `/spieler/${ID}` });
  });
  for (const sicht of ["guest", "hall"] as const satisfies readonly LobbySicht[]) {
    it(`${sicht}: Initialen, kein Link, Schlüssel nach Position (ohne Kennung)`, () => {
      const p = personRef(sicht, ID, NAME, 3);
      expect(p).toEqual({ key: "p3", label: "ZV", href: null });
      expect(JSON.stringify(p)).not.toContain(ID);
      expect(JSON.stringify(p)).not.toContain("Zorro");
    });
  }
});

describe("PersonName im HTML", () => {
  const html = (sicht: LobbySicht) => renderToStaticMarkup(createElement(PersonName, { person: personRef(sicht, ID, NAME, 0), className: "font-semibold" }));
  it("Gast und Betreiber: nur die Initialen, weder Name noch Kennung noch /spieler", () => {
    for (const s of ["guest", "hall"] as const) {
      const h = html(s);
      expect(h).toContain(">ZV<");
      expect(h).not.toContain("Zorro");
      expect(h).not.toContain(ID);
      expect(h).not.toContain("/spieler/");
      expect(h).not.toContain("<a ");
    }
  });
  it("Angemeldete: Link mit Name", () => {
    const h = html("member");
    expect(h).toContain(`href="/spieler/${ID}"`);
    expect(h).toContain(NAME);
  });
});

describe("autorLabel (Turnier: Veranstalter und Captain)", () => {
  it("Name nur für Angemeldete", () => {
    expect(autorLabel(NAME, "member")).toBe(NAME);
    expect(autorLabel(NAME, "guest")).toBe("ZV");
    expect(autorLabel(NAME, "hall")).toBe("ZV");
  });
});

describe("vornameInitial (Veranstalter in der Privatspiel-Einladung für Gäste)", () => {
  it("Vorname und Initiale des Nachnamens, nie der Nachname", () => {
    expect(vornameInitial("Alper Kagan")).toBe("Alper K.");
    expect(vornameInitial("Anna-Lena von Berg")).toBe("Anna-Lena B.");
    expect(vornameInitial("  Éva   Ünal ")).toBe("Éva Ü.");
    expect(vornameInitial("Alper Kagan")).not.toContain("Kagan");
  });
  it("einteilige und leere Namen", () => {
    expect(vornameInitial("Max")).toBe("Max");
    expect(vornameInitial("   ")).toBe("?");
  });
  it("ß am Anfang des Nachnamens wird nicht gekürzt wie ein Buchstabe (wie initialsOf)", () => {
    expect(vornameInitial("Jan ßmith")).toBe("Jan SS."); // ß wird zu SS
  });
});

describe("vornameInitial: Schreibweisen (R-T380)", () => {
  it("Komma-Format 'Nachname, Vorname': der Teil vor dem Komma ist der Nachname, nie im Klartext", () => {
    expect(vornameInitial("Kagan, Alper")).toBe("Alper K.");
    expect(vornameInitial("Kagan,Alper")).toBe("Alper K.");
    expect(vornameInitial("von Berg, Anna-Lena")).toBe("Anna-Lena B.");
    for (const n of ["Kagan, Alper", "Kagan,Alper"]) expect(vornameInitial(n)).not.toContain("Kagan");
  });
  it("unvollständiges Komma-Paar wie ein einteiliger Name, leer bleibt '?'", () => {
    expect(vornameInitial("Kagan,")).toBe("Kagan");
    expect(vornameInitial(",Alper")).toBe("Alper");
    expect(vornameInitial(",")).toBe("?");
    expect(vornameInitial("")).toBe("?");
  });
  it("Doppelname und Emoji", () => {
    expect(vornameInitial("Hans Peter Müller Lüdenscheid")).toBe("Hans L.");
    expect(vornameInitial("Max 😀")).toBe("Max 😀.");
    expect(vornameInitial("😀 Max")).toBe("😀 M.");
  });
});
