import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatEuro } from "@/lib/money";

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 11, fontFamily: "Helvetica", color: "#111" },
  brand: { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  muted: { color: "#555" },
  h1: { fontSize: 15, marginTop: 28, marginBottom: 10, fontWeight: 700 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#ddd" },
  total: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, fontSize: 13, fontWeight: 700 },
  note: { marginTop: 28, fontSize: 9, color: "#555", lineHeight: 1.4 },
});

export type ReceiptData = {
  number: string;
  issuedAt: Date;
  kind: "topup" | "match";
  amountCents: number;
  customerName: string;
  customerEmail: string;
  description: string;
  details: { label: string; value: string }[];
};

function ReceiptDocument({ data }: { data: ReceiptData }) {
  const date = data.issuedAt.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "long", year: "numeric" });
  return (
    <Document title={`Zahlungsbeleg ${data.number}`} author="Socaz">
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>SOCAZ</Text>
        <Text style={styles.muted}>Hallenfußball. Gegner finden. Spielen.</Text>

        <Text style={styles.h1}>Zahlungsbeleg {data.number}</Text>
        <View style={styles.row}><Text style={styles.muted}>Datum</Text><Text>{date}</Text></View>
        <View style={styles.row}><Text style={styles.muted}>Kunde</Text><Text>{data.customerName} ({data.customerEmail})</Text></View>
        {data.details.map((d) => (
          <View key={d.label} style={styles.row}><Text style={styles.muted}>{d.label}</Text><Text>{d.value}</Text></View>
        ))}

        <Text style={styles.h1}>Leistung</Text>
        <View style={styles.row}><Text>{data.description}</Text><Text>{formatEuro(data.amountCents)}</Text></View>
        <View style={styles.total}><Text>Gesamtbetrag</Text><Text>{formatEuro(data.amountCents)}</Text></View>

        <Text style={styles.note}>
          Dieser Beleg bestätigt die Zahlung. Er ist keine Rechnung im Sinne des Umsatzsteuergesetzes; der Ausweis der Umsatzsteuer erfolgt nach steuerlicher Klärung des Betreibers.
          Guthaben verfällt nicht und wird nicht ausgezahlt.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderReceiptPdf(data: ReceiptData): Promise<Buffer> {
  return renderToBuffer(<ReceiptDocument data={data} />);
}
