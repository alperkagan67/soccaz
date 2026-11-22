import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { MatchEvidence } from "./evidence-export";

// Beweisprotokoll als PDF (Vertrag 009 M3c, Plan 3.6). ENTWURF, ohne Lauf geschrieben. Schrift mindestens 12 pt (Regel soccaz/min-font-size). Keine Spieler- und keine Teamnamen;
// der Name des antwortenden Betreibers steht nur in diesem Admin-1-PDF. Fremdtext (Begründung der Halle) erscheint als reiner Text.
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

function EvidenceDocument({ data }: { data: MatchEvidence }) {
  const { report } = data;
  const title = `Beweisprotokoll Spiel ${data.number ?? "ohne Nummer"}`;
  return (
    <Document title={title}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>{title}</Text>
        <Text style={styles.muted}>Anfragen an Hallen und Antworten, Buchungsaufträge. Nur anhängend, mit Hash-Kette.</Text>
        <Text style={styles.muted}>Die Eintragszeit ist der Zeitpunkt des Abschlusses der jeweiligen Buchung in der Datenbank (nicht die Uhrzeit der Antwort).</Text>

        <Text style={styles.h2}>Einträge</Text>
        {data.entries.map((e) => (
          <View key={e.seq} style={styles.row} wrap={false}>
            <Text>
              Nr. {e.seq} · Runde {e.round} · {KIND_LABEL[e.kind] ?? e.kind}
              {e.venueName ? ` · ${e.venueName}` : ""}
            </Text>
            <Text style={styles.muted}>{utc(e.at)} · {berlin(e.at)}</Text>
            {e.actorName ? <Text style={styles.muted}>Antwort durch: {e.actorName}</Text> : null}
            {e.reason ? <Text style={styles.muted}>Begründung: {e.reason}</Text> : null}
            <Text style={styles.hash}>{e.hash}</Text>
          </View>
        ))}

        <Text style={styles.h2}>Prüfung der Gesamtkette</Text>
        <Text>Einträge insgesamt: {report.chain.count}</Text>
        <Text>Kopf-Hash:</Text>
        <Text style={styles.hash}>{report.chain.headHash || "(leer)"}</Text>
        <Text>Ergebnis: {report.chain.ok ? "Kette gültig" : `Kette UNGÜLTIG ab Nr. ${report.chain.firstBadSeq ?? "?"} (${report.chain.reason ?? "unbekannt"})`}</Text>
        {report.orphans.matchIds.length + report.orphans.venueIds.length > 0 ? <Text style={styles.warn}>Hinweis: verwaiste Verweise in der Kette ({report.orphans.matchIds.length} Spiele, {report.orphans.venueIds.length} Hallen).</Text> : null}
        {report.missing.length > 0 ? <Text style={styles.warn}>Hinweis: {report.missing.length} Anfragen oder Aufträge ohne Protokolleintrag.</Text> : null}
        <Text style={[styles.muted, { marginTop: 8 }]}>
          Dieser Auszug ist nur zusammen mit dem Gesamtketten-Export und dem extern abgelegten Kopf-Hash prüfbar (die Datenbank allein ist kein Beweis gegen eine Änderung durch Administratoren).
        </Text>
      </Page>
    </Document>
  );
}

export async function renderEvidencePdf(data: MatchEvidence): Promise<Buffer> {
  return renderToBuffer(<EvidenceDocument data={data} />);
}
