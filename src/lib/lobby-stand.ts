// 013 M3 PR 5a: "Dein Stand" der Lobby. Eine reine Funktion entscheidet je Rolle und Zustand die Zeile und die EINE Hauptaktion (AC-30: höchstens eine btn-primary je Ansicht).
// Die Knöpfe selbst bleiben in ihren Bausteinen (Handler unverändert); die Seite reicht `aktion` an sie weiter, nur der Besitzer der Hauptaktion ist btn-primary, alle anderen btn-ghost.
// Keine Zahlungs-Rechtsfolge in der Zeile: Preis- und Zusagetexte stehen NUR in zahlungspflicht-texte.ts.
import type { LobbyFehlerFall } from "./lobby-fehler";

export type LobbyAktion = "anmelden" | "annehmen" | "beitreten" | "ersatz" | "karte" | "freigeben" | "vorschlagen" | "bereit" | "final" | "spielseite" | null;

export type LobbyStandInput = {
  signedIn: boolean;
  status: string; // lobby | confirmed | cancelled | played | disputed
  active: boolean; // Spiel läuft noch (Lobby/bestätigt, nicht vorbei)
  planning: boolean; // Termin- oder Hallenwahl läuft: nur Captains handeln
  /** Phase der Planung: termin = Uhrzeit wird gewählt, hallen = Hallen werden angefragt, veto = Captains bannen. */
  planningPhase?: "termin" | "hallen" | "veto" | null;
  isCaptain?: boolean; // Team-Admin eines der beiden Teams (darf in der Planung handeln)
  myTurn?: boolean; // im Veto: das eigene Team ist am Zug
  challengePending: boolean;
  challengeRole: "target" | "challenger" | "viewer";
  participant: boolean;
  hasTeam: boolean;
  ready: boolean;
  canJoin: boolean;
  canJoinAsSubstitute: boolean;
  teamFull: boolean;
  cardOn: boolean; // Kartenmodell für dieses Spiel
  cardReady: boolean;
  chargeFailure: LobbyFehlerFall | null; // eigene Abbuchung fehlgeschlagen: Fall (lobby-fehler.ts), sonst null
  minReady: number;
  /** Team, für das der Betrachter die Letzte Bestätigung geben darf (Captain), sonst null. */
  finalTeam: { confirmed: boolean; complete: boolean } | null;
};

export type LobbyStand = { zeile: string; aktion: LobbyAktion };

export function lobbyStand(s: LobbyStandInput): LobbyStand {
  if (s.status === "cancelled") return { zeile: "Das Spiel findet nicht statt.", aktion: null };
  if (!s.active) return { zeile: "Dieses Spiel ist vorbei. Das Ergebnis steht auf der Spielseite.", aktion: "spielseite" };
  if (!s.signedIn) return { zeile: "Du bist nicht angemeldet. Melde dich an, um beizutreten oder dein Team herauszufordern.", aktion: "anmelden" };
  if (s.challengePending) {
    return s.challengeRole === "target"
      ? { zeile: "Dein Team ist herausgefordert. Nächster Schritt: die Herausforderung annehmen.", aktion: "annehmen" }
      : { zeile: "Die Herausforderung wartet auf die Annahme durch das andere Team.", aktion: null };
  }
  if (s.planning) {
    // Impeccable Lauf 2, P1-4: der Captain sieht den Schritt, nicht nur "wartet". Termin: Vorschlag machen ist die Hauptaktion (Zustimmen bleibt ruhig). Veto: Bannen ist je Halle ein ruhiger Knopf, keine orange Hauptaktion.
    if (s.isCaptain && s.planningPhase === "termin") return { zeile: "Nächster Schritt: die Uhrzeit wählen. Mach einen Vorschlag oder stimme einem Vorschlag zu.", aktion: "vorschlagen" };
    if (s.isCaptain && s.planningPhase === "veto") return { zeile: s.myTurn ? "Nächster Schritt: eine Halle bannen." : "Das andere Team ist beim Bannen dran.", aktion: null };
    if (s.isCaptain && s.planningPhase === "hallen") return { zeile: "Die Hallen werden angefragt. Danach bannt ihr abwechselnd Hallen.", aktion: null };
    return { zeile: s.participant ? "Die Captains wählen Uhrzeit und Halle. Bereit machen kannst du danach." : "Die Captains wählen Uhrzeit und Halle.", aktion: null };
  }
  // Captain mit komplett bereitem Team bestätigt, auch ohne selbst in der Lobby zu stehen (complete verlangt, dass alle Eingeteilten bereit sind)
  if (s.finalTeam && !s.finalTeam.confirmed && s.finalTeam.complete) return { zeile: "Dein Team ist komplett bereit. Nächster Schritt: die Letzte Bestätigung.", aktion: "final" };
  if (!s.participant) {
    if (s.canJoin) return { zeile: "Du bist noch nicht dabei. Nächster Schritt: dem Spiel beitreten.", aktion: "beitreten" };
    if (s.teamFull) return { zeile: "Für dein Team ist kein Platz mehr frei.", aktion: null };
    if (s.canJoinAsSubstitute) return { zeile: "Du bist noch nicht dabei. Nächster Schritt: als Ersatzspieler anbieten.", aktion: "ersatz" };
    return { zeile: "Du schaust zu.", aktion: null };
  }
  if (!s.hasTeam) return { zeile: "Du bist in der Lobby und wartest auf die Zuweisung durch einen Team-Admin.", aktion: null };
  if (s.chargeFailure === "abgelaufen") return { zeile: "Deine Abbuchung ist fehlgeschlagen und das Zeitfenster ist abgelaufen.", aktion: null };
  if (s.chargeFailure === "freigabe") return { zeile: "Deine Abbuchung ist fehlgeschlagen. Nächster Schritt: die Zahlung freigeben.", aktion: "freigeben" };
  if (s.chargeFailure === "karte") return { zeile: "Deine Abbuchung ist fehlgeschlagen. Nächster Schritt: die Karte ändern.", aktion: "karte" };
  if (!s.ready) {
    return s.cardOn && !s.cardReady
      ? { zeile: "Du bist dabei, aber noch nicht bereit. Nächster Schritt: Karte hinterlegen.", aktion: "karte" }
      : { zeile: "Du bist dabei, aber noch nicht bereit. Nächster Schritt: bereit machen.", aktion: "bereit" };
  }
  if (s.finalTeam && !s.finalTeam.confirmed) {
    return { zeile: `Du bist bereit. Die Letzte Bestätigung geht, sobald dein Team komplett bereit ist (mindestens ${s.minReady} Spieler).`, aktion: null };
  }
  if (s.finalTeam?.confirmed) return { zeile: "Deine Bestätigung liegt vor. Wir warten auf den Captain des anderen Teams.", aktion: null };
  return { zeile: "Du bist bereit. Wir warten auf die anderen.", aktion: null };
}
