"use client";

import { CardForm } from "../../lobby/[id]/CardForm";

/** "Karte ändern" im Konto, ausserhalb einer Lobby (Vertrag 012, M3b AC-5): Mandatstext, Stripe-Formular, die Karte geht nie über unseren Server. */
export function CardChange({ mandateText, fake }: { mandateText: string; fake: boolean }) {
  return <CardForm mandateText={mandateText} fake={fake} stored={null} change />;
}
