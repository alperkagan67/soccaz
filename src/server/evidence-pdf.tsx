import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { pdfSafe } from "@/lib/evidence";
import type { MatchEvidence } from "./evidence-export";

// Beweisprotokoll als PDF (Vertrag 009 M3c, Plan 3.6). ENTWURF, ohne Lauf geschrieben. Schrift mindestens 12 pt (Regel soccaz/min-font-size). Keine Spieler- und keine Teamnamen;
// der Name des antwortenden Betreibers steht nur in diesem Admin-1-PDF. ALLER Fremdtext (Begründung, Hallenname, Betreibername) läuft durch pdfSafe: Steuer-/Bidi-/Zero-Width-Zeichen
// entfernt, alles außerhalb von Latin-1/WinAnsi als "?" (Helvetica). Der Inhalt entsteht in einem reinen Modell (evidencePdfModel), das ohne Renderer testbar ist.
const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 12, fontFamily: "Helvetica", color: "#111" },
  brand: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  h2: { fontSize: 13, marginTop: 14, marginBottom: 6, fontWeight: 700 },
  muted: { color: "#444", lineHeight: 1.35 },
  row: { paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "#ddd" },
  hash: { fontSize: 12, fontFamily: "Courier" },
  warn: { marginTop: 8, fontWeight: 700 },
});

const utc = (d: Date) => d.toISOString().replace("T", " ").replace("Z", " UTC");
const berlin = (d: Date) => d.toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "medium" }) + " (Berlin)";

const KIND_LABEL: Record<string, string> = {
  request_sent: "Anfrage an die Halle gesendet",
  unmanaged: "Halle ohne Betreiber (keine Anfrage möglich)",
  accepted: "Halle hat zugesagt",
  declined: "Halle hat abgelehnt",
  expired: "Frist abgelaufen, keine Antwort",
  job_open: "Buchungsauftrag angelegt",
  job_booked: "Auftrag: gebucht",
  job_confirmed: "Auftrag: bestätigt",
  job_unavailable: "Auftrag: nicht verfügbar",
  job_withdrawn: "Auftrag zurückgezogen",
  job_done: "Auftrag erledigt",
};

export type EvidencePdfModel = {
  title: string;
  intro: string[];
  entries: { seq: number; head: string; times: string; actor: string | null; reason: string | null; hash: string }[];
  summary: { count: string; headHash: string; result: string; checkedAt: string };
  warnings: string[];
  notice: string;
};

/** Der gesamte Text des PDFs als Daten (testbar ohne Renderer): bereinigter Fremdtext, keine Team-/Spielernamen. */
export function evidencePdfModel(data: MatchEvidence): EvidencePdfModel {
  const { report } = data;
  const warnings: string[] = [];
  if (report.orphans.matchIds.length + report.orphans.venueIds.length > 0) warnings.push(`Hinweis: verwaiste Verweise in der Kette (${report.orphans.matchIds.length} Spiele, ${report.orphans.venueIds.length} Hallen).`);
  if (report.missing.length > 0) warnings.push(`Hinweis: ${report.missing.length} Anfragen oder Aufträge ohne Protokolleintrag.`);
  return {
    title: `Beweisprotokoll Spiel ${data.number ?? "ohne Nummer"}`,
    intro: [
      "Anfragen an Hallen und Antworten, Buchungsaufträge. Nur anhängend, mit Hash-Kette.",
      "Die Eintragszeit ist der Zeitpunkt des Abschlusses der jeweiligen Buchung in der Datenbank (nicht die Uhrzeit der Antwort).",
    ],
    entries: data.entries.map((e) => ({
      seq: e.seq,
      head: `Nr. ${e.seq} · Runde ${e.round} · ${KIND_LABEL[e.kind] ?? pdfSafe(e.kind)}${e.venueName ? ` · ${pdfSafe(e.venueName)}` : ""}`,
      times: `${utc(e.at)} · ${berlin(e.at)}`,
      actor: e.actorName ? `Antwort durch: ${pdfSafe(e.actorName)}` : null,
      reason: e.reason ? `Begründung: ${pdfSafe(e.reason)}` : null,
      hash: e.hash,
    })),
    summary: {
      count: `Einträge insgesamt: ${report.chain.count}`,
      headHash: report.chain.headHash || "(leer)",
      result: `Ergebnis: ${report.chain.ok ? "Kette gültig" : `Kette UNGÜLTIG ab Nr. ${report.chain.firstBadSeq ?? "?"} (${report.chain.reason ?? "unbekannt"})`}`,
      checkedAt: `Prüfstand vom ${utc(report.checkedAt)} (höchstens einmal pro Minute neu berechnet; der Tagesjob rechnet täglich frisch)`,
    },
    warnings,
    notice: "Dieser Auszug ist nur zusammen mit dem Gesamtketten-Export und dem extern abgelegten Kopf-Hash prüfbar (die Datenbank allein ist kein Beweis gegen eine Änderung durch Administratoren).",
  };
}

function EvidenceDocument({ data }: { data: MatchEvidence }) {
  const m = evidencePdfModel(data);
  return (
    <Document title={m.title}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>{m.title}</Text>
        {m.intro.map((l, i) => (
          <Text key={i} style={styles.muted}>{l}</Text>
        ))}

        <Text style={styles.h2}>Einträge</Text>
        {m.entries.map((e) => (
          <View key={e.seq} style={styles.row} wrap={false}>
            <Text>{e.head}</Text>
            <Text style={styles.muted}>{e.times}</Text>
            {e.actor ? <Text style={styles.muted}>{e.actor}</Text> : null}
            {e.reason ? <Text style={styles.muted}>{e.reason}</Text> : null}
            <Text style={styles.hash}>{e.hash}</Text>
          </View>
        ))}

        <Text style={styles.h2}>Prüfung der Gesamtkette</Text>
        <Text>{m.summary.count}</Text>
        <Text>Kopf-Hash:</Text>
        <Text style={styles.hash}>{m.summary.headHash}</Text>
        <Text>{m.summary.result}</Text>
        <Text style={styles.muted}>{m.summary.checkedAt}</Text>
        {m.warnings.map((w, i) => (
          <Text key={i} style={styles.warn}>{w}</Text>
        ))}
        <Text style={[styles.muted, { marginTop: 8 }]}>{m.notice}</Text>
      </Page>
    </Document>
  );
}

export async function renderEvidencePdf(data: MatchEvidence): Promise<Buffer> {
  return renderToBuffer(<EvidenceDocument data={data} />);
}
