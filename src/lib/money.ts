// Alle Beträge sind ganze Cent (Integer). Es wird nie mit Kommazahlen gerechnet.

export const MAX_PLAYERS_TOTAL = 12; // 2 Teams x (5 Spieler + 1 Ersatz)
export const MIN_TOPUP_CENTS = 500;
export const MAX_TOPUP_CENTS = 20_000;

const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export function formatEuro(cents: number): string {
  return euro.format(cents / 100);
}

/** "12,50", "12.5", "12" -> 1250. Gibt null bei ungültiger Eingabe (negativ, mehr als 2 Nachkommastellen, kein Betrag). */
export function parseEuro(input: string): number | null {
  const text = input.trim().replace(/\s/g, "").replace("€", "").replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/** Ganzzahlige Division, die aufrundet (damit die Summe der Anteile den Preis nie unterschreitet). */
export function ceilDiv(a: number, b: number): number {
  if (b <= 0) throw new Error("Teiler muss positiv sein");
  return Math.ceil(a / b);
}

/** Anteil pro Spieler bei `players` Teilnehmern. */
export function shareFor(priceCents: number, players: number): number {
  return ceilDiv(priceCents, Math.min(Math.max(players, 1), MAX_PLAYERS_TOTAL));
}

/** Betrag, der beim Bereitmachen reserviert wird: der höchstmögliche Anteil (bei Mindestzahl Spielern). Zu viel gezahltes wird bei der Abrechnung zurückgebucht. */
export function reservationFor(priceCents: number, minPaidPlayers: number): number {
  return shareFor(priceCents, minPaidPlayers);
}

/** Endgültiger Anteil zur Abrechnung: Preis geteilt durch die Zahl der zahlenden Spieler (mindestens die Mindestzahl, höchstens 12). */
export function finalShareFor(priceCents: number, paidPlayers: number, minPaidPlayers: number): number {
  return shareFor(priceCents, Math.max(paidPlayers, minPaidPlayers));
}

export function isValidTopup(cents: number): boolean {
  return Number.isInteger(cents) && cents >= MIN_TOPUP_CENTS && cents <= MAX_TOPUP_CENTS;
}

// ---------------------------------------------------------------------------------------------
// Privatspiel: Miete geteilt durch alle Spieler (ohne Deckel bei 12, ohne Mindestwert)
// ---------------------------------------------------------------------------------------------

function assertRentAndPlayers(rentCents: number, n: number) {
  if (!Number.isInteger(rentCents) || rentCents < 0) throw new Error("Miete muss eine ganze Zahl in Cent von mindestens 0 sein");
  if (!Number.isInteger(n) || n < 1) throw new Error("Spielerzahl muss eine ganze Zahl von mindestens 1 sein");
}

/** Anteil pro Spieler im Privatspiel: Miete in Cent geteilt durch die Spielerzahl, aufgerundet (rein ganzzahlig gerechnet). */
export function shareCents(rentCents: number, n: number): number {
  assertRentAndPlayers(rentCents, n);
  const rest = rentCents % n;
  return (rentCents - rest) / n + (rest > 0 ? 1 : 0);
}

/** Überschuss durch das Aufrunden: alle Anteile zusammen minus die Miete (nie negativ, immer kleiner als die Spielerzahl in Cent). */
export function roundingRemainderCents(rentCents: number, n: number): number {
  return n * shareCents(rentCents, n) - rentCents;
}
