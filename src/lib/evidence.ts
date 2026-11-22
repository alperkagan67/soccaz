// Beweisprotokoll (Vertrag 009 M3, Plan docs/design/009-m3-plan.md): reine Definitionen ohne Datenbankzugriff.

/** Arten der Einträge (Matrix "Zustandswechsel -> kind", Plan 3.2). Dieselbe Liste steht als CHECK in der Tabelle booking_evidence; ein Test vergleicht beide. */
export const EVIDENCE_KINDS = [
  "request_sent", // Anfrage an die Halle gesendet (Hallenprüfung, Halle mit Betreiber)
  "unmanaged", // Halle ohne Betreiber: keine Anfrage möglich (011 P5)
  "accepted", // Halle bestätigt (frei)
  "declined", // Halle lehnt ab (belegt), Begründung ab 011 M2
  "expired", // Frist abgelaufen ohne Antwort
  "job_open", // Buchungsauftrag angelegt
  "job_booked",
  "job_confirmed",
  "job_unavailable",
  "job_withdrawn",
  "job_done",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const EVIDENCE_REASON_MAX = 300;

/** Begründung der Halle ist Fremdtext: Steuerzeichen (außer Zeilenumbruch und Tab) entfernen, Leerraum zusammenfassen, auf 300 Zeichen kürzen. Leer = keine Begründung. */
export function cleanReason(input: string | null | undefined): string {
  if (!input) return "";
  const noControl = input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069\u200B-\u200F\u2060-\u2064\uFEFF]/g, "");
  const flat = noControl.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return Array.from(flat).slice(0, EVIDENCE_REASON_MAX).join("");
}

/** Anfrage-Arten: je Spiel, Halle und Runde höchstens ein Eintrag (partieller UNIQUE-Index, Existenzprüfung unter der Zählersperre). Die job_*-Arten sind nicht eindeutig (Plan 12 a). */
export const REQUEST_KINDS: readonly EvidenceKind[] = ["request_sent", "unmanaged", "accepted", "declined", "expired"];
export const isRequestKind = (k: EvidenceKind) => REQUEST_KINDS.includes(k);

/**
 * Text für das PDF (Standardschrift Helvetica kennt nur Latin-1/WinAnsi): Steuer-, Richtungs- und Zero-Width-Zeichen entfernen (wie cleanReason), alles außerhalb von Latin-1 und der gängigen
 * WinAnsi-Zeichen (€, „“”, –, —, …) durch "?" ersetzen (ein Zeichen je Codepunkt, auch Emoji). Der Renderer stört sich dann an keinem Zeichen.
 */
export function pdfSafe(input: string | null | undefined): string {
  return Array.from(cleanReason(input))
    .map((ch) => (/[\u0000-\u00FF\u20AC\u201E\u201C\u201D\u2013\u2014\u2026\n]/.test(ch) ? ch : "?"))
    .join("");
}
