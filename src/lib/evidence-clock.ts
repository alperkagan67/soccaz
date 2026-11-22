// 011 M2a: Uhrenquelle der Hallen-Fristen (Plan 009 M3, 16g.5). Marker: veto.ts entscheidet „abgelaufen“ für Hallenanfragen NUR mit der Datenbankzeit
// (transaction_timestamp()/now(), strikt: genau am Fristende noch zulässig), nie mit der JavaScript-Uhr. Ein Quelltext-Test hält das fest.
// Der Admin-Schalter „Uhrenquelle auf Datenbank“ wird verweigert, solange der Marker nicht „db“ ist.
export const EVIDENCE_CLOCK = "db" as const;
