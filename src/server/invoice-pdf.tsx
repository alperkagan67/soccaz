import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatEuro } from "@/lib/money";
import type { InvoiceData } from "./invoices";

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 12, fontFamily: "Helvetica", color: "#111" },
  brand: { fontSize: 18, fontWeight: 700, marginBottom: 2 },
  muted: { color: "#555" },
  h1: { fontSize: 14, marginTop: 24, marginBottom: 8, fontWeight: 700 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: "#ddd" },
  sum: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  total: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, fontSize: 12, fontWeight: 700 },
  note: { marginTop: 20, fontSize: 12, color: "#333", lineHeight: 1.4 },
});

/** Monatsrechnung über die Provision an die Halle. Inhalt: Datum, Uhrzeit, Spielnummer, Betrag; keine Team- und keine Spielernamen. */
function InvoiceDocument({ data }: { data: InvoiceData }) {
  const date = data.issuedAt.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "long", year: "numeric" });
  return (
    <Document title={`Rechnung ${data.number}`} author={data.operator.name}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>{data.operator.name}</Text>
        <Text style={styles.muted}>{data.operator.address}</Text>
        <Text style={styles.muted}>Steuer-Nr./USt-IdNr.: {data.operator.taxId}</Text>

        <Text style={styles.h1}>Rechnung {data.number}</Text>
        <View style={styles.row}><Text style={styles.muted}>Rechnungsdatum</Text><Text>{date}</Text></View>
        <View style={styles.row}><Text style={styles.muted}>Zeitraum</Text><Text>{data.period}</Text></View>
        <View style={styles.row}><Text style={styles.muted}>Rechnung an</Text><Text>{data.venueName}{data.venueAddress ? `, ${data.venueAddress}` : ""}</Text></View>

        <Text style={styles.h1}>Provision</Text>
        {data.lines.map((l, i) => (
          <View key={i} style={styles.row}><Text>{l.label}</Text><Text>{formatEuro(l.amountCents)}</Text></View>
        ))}
        <View style={styles.sum}><Text>Nettobetrag</Text><Text>{formatEuro(data.netCents)}</Text></View>
        <View style={styles.sum}><Text>Umsatzsteuer {data.vatPercent} %</Text><Text>{formatEuro(data.vatCents)}</Text></View>
        <View style={styles.total}><Text>Rechnungsbetrag</Text><Text>{formatEuro(data.grossCents)}</Text></View>
        {data.note && <Text style={styles.note}>{data.note}</Text>}
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(data: InvoiceData): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument data={data} />);
}
