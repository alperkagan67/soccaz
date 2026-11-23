import { describe, expect, it } from "vitest";
import { NOTIFICATION_TYPES, emailsFor, isOptionalType } from "@/lib/notification-types";

// Pflichttypen (nicht abschaltbar) und abschaltbare Typen: eine Aenderung muss BEWUSST geschehen (Test mit festen Listen).
const PFLICHT = ["hall.request", "veto.turn", "match.found", "match.scheduled", "match.cancelled", "result.confirm", "result.reminder", "result.disputed", "payment", "system", "system.critical"].sort();
const ABSCHALTBAR = ["request.accepted", "player.request", "request.challenge", "team.joined", "lobby.joined", "lobby.substitute", "match.confirmed", "match.reminder", "result.final", "admin.task"].sort();

describe("Benachrichtigungsarten: Pflicht und abschaltbar", () => {
  it("genau diese Typen sind Pflicht, genau diese abschaltbar", () => {
    const all = Object.keys(NOTIFICATION_TYPES);
    expect(all.filter((t) => !NOTIFICATION_TYPES[t as keyof typeof NOTIFICATION_TYPES].optional).sort()).toEqual(PFLICHT);
    expect(all.filter((t) => NOTIFICATION_TYPES[t as keyof typeof NOTIFICATION_TYPES].optional).sort()).toEqual(ABSCHALTBAR);
    expect(all.length).toBe(PFLICHT.length + ABSCHALTBAR.length);
  });

  it("system.critical (Notschalter): nicht abschaltbar, nur In-App (keine E-Mail bis zum Mail-Dienst)", () => {
    expect(isOptionalType("system.critical")).toBe(false);
    expect(emailsFor("system.critical")).toBe(false);
  });

  it("unbekannte Typen gelten als abschaltbar und ohne E-Mail (sicherer Standard)", () => {
    expect(isOptionalType("gibt.es.nicht")).toBe(true);
    expect(emailsFor("gibt.es.nicht")).toBe(false);
  });

  it("admin.task bleibt abschaltbar (Aufgabenmeldungen), der Hinweis auf der Einstellungsseite listet nur abschaltbare Typen", () => {
    expect(isOptionalType("admin.task")).toBe(true);
  });
});
