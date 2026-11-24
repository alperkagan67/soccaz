// 013 M3 PR 5b: der Fehlerzustand "Abbuchung fehlgeschlagen" hat je Fall EINEN nächsten Schritt (AC-30, Impeccable-Befund 3).
// abgelaufen: nichts zu tun (Platz wird neu vergeben); als Ausweg nur der ruhige Ghost-Link „Andere Spiele suchen“ (keine Hauptaktion, Entscheid t2q 2026-11-24, Pilot-P2). freigabe: die Bank braucht die Freigabe (Hauptaktion "Zahlung freigeben", "andere Karte" nur eingeklappt). karte: Karte ändern.
// Reine Funktion: dieselbe Entscheidung treibt MyActions (Knöpfe) und "Dein Stand" (Zeile und Hauptaktion).
export type LobbyFehlerFall = "abgelaufen" | "freigabe" | "karte";

export function lobbyFehlerFall(f: { expired: boolean; authorize?: boolean }): LobbyFehlerFall {
  if (f.expired) return "abgelaufen";
  return f.authorize ? "freigabe" : "karte";
}
