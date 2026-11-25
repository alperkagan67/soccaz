// Zahlungen AUS (Go-live, Entscheid t2q): Privatspiele sind NUR kostenlos. Der Satz steht anstelle der Mietwahl im Formular /app/privatspiel/neu; die Miete wird im Server auf 0 erzwungen
// (parseRentFuerSchalter in src/server/privategame.ts), unabhängig vom Formular und von TURNIER_ONLY. Kein Zahlungswort (Wortliste src/lib/zahlungen-aus.ts).
export const PRIVATSPIEL_KOSTENLOS = "Das Spiel ist kostenlos. Eine Miete regelt ihr außerhalb von Soccaz.";
