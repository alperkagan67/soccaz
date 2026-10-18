// CSV für deutsches Excel: Semikolon als Trenner, Komma als Dezimalzeichen, UTF-8 mit BOM.

/** Schützt vor Formel-Einschleusung: Zellen, die mit = + - @ beginnen, bekommen ein Hochkomma vorangestellt. */
function neutralize(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "number" ? String(value) : neutralize(value);
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(";");
}

/** Cent als Euro-Betrag mit Dezimalkomma ("1234" -> "12,34"). Für Beträge ohne Währungszeichen. */
export function euroForCsv(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return "﻿" + rows.map(csvRow).join("\r\n") + "\r\n";
}
