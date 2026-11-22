// Texte des Dialogs "Anteil übernehmen" (Vertrag 012, M3c-3b), als reine Funktionen (ohne Server-Aktionen testbar).
export type CoverAmounts = { own: string; target: string; total: string; estimated: boolean };

/** Der Text vor der Übernahme (Vorgabe t9): Zusatzposten zur Frist mit der Karte von B; scheitert er, verfällt der Platz; B verliert nur diesen Posten; neue Karte im Fenster, dann ein erneuter Versuch. */
export function coverDialogBody(targetName: string): string {
  return (
    `Zur Frist wird zusätzlich der Anteil von ${targetName} von deiner Karte abgebucht (ein eigener Zusatzposten, nicht sofort). ` +
    `Scheitert dieser Posten, verfällt der Platz von ${targetName}; du verlierst nur diesen Posten. ` +
    "Scheitert die Abbuchung, kannst du innerhalb des Fensters eine andere Karte hinterlegen; dann versuchen wir es einmal erneut. " +
    "Bis zur Frist kannst du die Übernahme hier zurücknehmen."
  );
}

/** Der sichtbare Betrag im Dialog; vor "Preis steht fest" nur voraussichtlich. */
export function coverConsequence(targetName: string, a: CoverAmounts): string {
  return `${a.estimated ? "Voraussichtlich zur" : "Zur"} Frist von deiner Karte: dein Anteil ${a.own} und der Anteil von ${targetName} ${a.target}, zusammen ${a.total}.${a.estimated ? " Endgültig steht der Betrag mit „Preis steht fest“." : ""}`;
}
