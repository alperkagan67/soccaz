// "Anteil übernehmen" (Vertrag 012, M3c-3b): Wer darf neben welchem Platz den Knopf sehen? Reine Funktion, wird auf dem SERVER aufgerufen (Seite und Client bekommen nur das Ergebnis);
// der Server prüft dieselben Regeln noch einmal beim Eintragen (takeOverShare in src/server/payments/cover.ts), der Knopf ist nie die Sperre.
//
// Regeln (Plan docs/design/m3c-3b-plan.md, Abschnitt 3): B ist eingeteilt und hat selbst eine Karte (card_ready); der Zielplatz A ist eingeteilt, nicht B, ohne Karte oder mit gescheiterter
// Abbuchung (für Dritte dieselbe rote Ampel), im Teamspiel im selben Team (im Privatspiel genügt "eingeteilt"); A ist nicht schon übernommen, B übernimmt noch keinen Platz (ein Platz
// je Übernehmer, keine Kette); und es ist noch offen: das Spiel ist offen, es gibt noch keine Abbuchungszeilen und die Frist ("Lobby schließt") ist nicht erreicht. "Offen" ist eine
// Eigenschaft des SPIELS, nicht des Platzes: so verrät das Verschwinden des Knopfs bei einem Platz nichts über einen Fehlschlag.
export type CoverRuleSeat = { userId: string; teamId: string | null; cardStatus: string };

const HAS_CARD = ["card_ready", "charge_pending", "charged"];

export type CoverRuleInput = {
  viewerId: string | null;
  seats: readonly CoverRuleSeat[];
  /** gültige Übernahmen: Zielplatz -> Zahler (validCoversOf) */
  validCovers: ReadonlyMap<string, string>;
  /** Teamspiel: nur im selben Team */
  teamGame: boolean;
  /** Spiel offen, keine Abbuchungszeilen, Frist nicht erreicht */
  open: boolean;
};

/** Plätze, deren Anteil der Betrachter übernehmen darf (leer, wenn er gar nicht darf). */
export function coverTargets({ viewerId, seats, validCovers, teamGame, open }: CoverRuleInput): string[] {
  if (!viewerId || !open) return [];
  const me = seats.find((s) => s.userId === viewerId);
  if (!me || me.teamId === null || me.cardStatus !== "card_ready") return [];
  if ([...validCovers.values()].includes(viewerId)) return []; // übernimmt schon einen Platz
  if (validCovers.has(viewerId)) return []; // ist selbst übernommen (keine Kette)
  return seats
    .filter(
      (t) =>
        t.userId !== viewerId &&
        t.teamId !== null &&
        !HAS_CARD.includes(t.cardStatus) &&
        (!teamGame || t.teamId === me.teamId) &&
        !validCovers.has(t.userId),
    )
    .map((t) => t.userId);
}

export type CoverRole = { covering: string | null; covered: boolean };

/** Welche Rolle hat der Betrachter in den gültigen Übernahmen: übernimmt er einen Platz (welchen) und ist sein eigener Platz übernommen? */
export function coverRoleOf(viewerId: string | null, validCovers: ReadonlyMap<string, string>): CoverRole {
  if (!viewerId) return { covering: null, covered: false };
  let covering: string | null = null;
  for (const [target, payer] of validCovers) if (payer === viewerId) covering = target;
  return { covering, covered: validCovers.has(viewerId) };
}
