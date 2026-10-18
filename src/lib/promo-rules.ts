export type PromoCodeRule = {
  kind: "percent" | "fixed";
  value: number; // Prozent (1 bis 100) oder Cent
  minTopupCents: number;
  maxBonusCents: number | null;
  budgetCents: number | null;
  usedCents: number;
  validFrom: Date | null;
  validUntil: Date | null;
  newUsersOnly: boolean;
  maxPerUser: number;
  active: boolean;
};

export type PromoContext = {
  topupCents: number;
  now: Date;
  /** Hat dieser Nutzer schon einmal erfolgreich aufgeladen? */
  hasPriorTopup: boolean;
  /** Wie oft hat dieser Nutzer den Code schon eingelöst? */
  userRedemptions: number;
};

/** Bonus in Cent für einen Aufladebetrag (ohne Prüfung der Regeln). */
export function computeBonus(rule: Pick<PromoCodeRule, "kind" | "value" | "maxBonusCents">, topupCents: number): number {
  const raw = rule.kind === "percent" ? Math.floor((topupCents * rule.value) / 100) : rule.value;
  const capped = rule.maxBonusCents === null ? raw : Math.min(raw, rule.maxBonusCents);
  return Math.max(0, capped);
}

export type PromoCheck = { ok: true; bonusCents: number } | { ok: false; reason: string };

/** Prüft alle Regeln eines Codes. Gibt den Bonus oder einen verständlichen Grund für die Ablehnung zurück. */
export function checkPromo(rule: PromoCodeRule, ctx: PromoContext): PromoCheck {
  if (!rule.active) return { ok: false, reason: "Dieser Code ist nicht mehr aktiv." };
  if (rule.validFrom && ctx.now < rule.validFrom) return { ok: false, reason: "Dieser Code ist noch nicht gültig." };
  if (rule.validUntil && ctx.now > rule.validUntil) return { ok: false, reason: "Dieser Code ist abgelaufen." };
  if (ctx.topupCents < rule.minTopupCents) return { ok: false, reason: `Der Code gilt ab einer Aufladung von ${(rule.minTopupCents / 100).toFixed(2).replace(".", ",")} €.` };
  if (rule.newUsersOnly && ctx.hasPriorTopup) return { ok: false, reason: "Dieser Code gilt nur für die erste Aufladung." };
  if (ctx.userRedemptions >= rule.maxPerUser) return { ok: false, reason: "Du hast diesen Code schon eingelöst." };

  const bonus = computeBonus(rule, ctx.topupCents);
  if (bonus <= 0) return { ok: false, reason: "Mit diesem Betrag ergibt der Code keinen Bonus." };
  if (rule.budgetCents !== null && rule.usedCents + bonus > rule.budgetCents) return { ok: false, reason: "Das Budget dieses Codes ist aufgebraucht." };
  return { ok: true, bonusCents: bonus };
}

export function normalizeCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}
