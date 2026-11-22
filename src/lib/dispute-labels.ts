/** Anzeigetexte der Stripe-Streitstatus (unbekannte Werte werden roh angezeigt, nie als Fehler). Eigene Datei: Next-Seiten duerfen nichts ausser der Seite exportieren. */
export const DISPUTE_STATUS_LABEL: Record<string, string> = {
  needs_response: "Antwort nötig",
  under_review: "In Prüfung",
  won: "Gewonnen",
  lost: "Verloren",
  warning_needs_response: "Warnung: Antwort nötig",
  warning_under_review: "Warnung: in Prüfung",
  warning_closed: "Warnung geschlossen",
  prevented: "Verhindert",
};
