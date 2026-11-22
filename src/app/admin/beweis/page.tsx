import type { Metadata } from "next";
import { formatDateTime } from "@/lib/time";
import { evidenceReport } from "@/server/evidence";
import { listEvidenceMatches } from "@/server/evidence-export";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Admin: Beweisprotokoll" };

const EXPORT_URL = "/api/beweis/kette"; // Dateidownload (Route-Handler), kein Seitenwechsel: darum kein Link-Element

/**
 * Beweisprotokoll (Vertrag 009 M3c, ENTWURF ohne Lauf): Stand der Gesamtkette (Anzahl, Kopf-Hash, Prüfergebnis, verwaiste Verweise, fehlende Einträge), Gesamtketten-Export und die Spiele mit Einträgen
 * mit PDF-Abruf. Nur Admin 1. Admin-Seite degradiert bis 013 M7 (wie M2); der Kopf-Hash steht in JEDEM Abruf (Plan Q1a, Variante G).
 */
export default async function EvidencePage() {
  await requirePermission("owner", "/admin/beweis");
  const report = await evidenceReport();
  const rows = await listEvidenceMatches();
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Beweisprotokoll</h1>
      <p className="text-sm text-muted">Anfragen an Hallen, Antworten und Buchungsaufträge, nur anhängend und mit Hash-Kette. Die Eintragszeit ist der Zeitpunkt des Abschlusses in der Datenbank.</p>

      <div className="card space-y-2" data-testid="evidence-head">
        <p>
          Einträge insgesamt: <strong data-testid="evidence-count">{report.chain.count}</strong>
        </p>
        <p className="break-all">
          Kopf-Hash: <code className="font-mono text-sm" data-testid="evidence-head-hash">{report.chain.headHash || "(leer)"}</code>
        </p>
        <p data-testid="evidence-status">
          {report.ok ? "Kette gültig, keine Abweichung." : `Abweichung: ${report.chain.ok ? "" : `Kette ungültig ab Nr. ${report.chain.firstBadSeq} (${report.chain.reason}). `}${report.orphans.matchIds.length + report.orphans.venueIds.length ? `${report.orphans.matchIds.length} verwaiste Spiele, ${report.orphans.venueIds.length} verwaiste Hallen. ` : ""}${report.missing.length ? `${report.missing.length} Anfragen/Aufträge ohne Eintrag.` : ""}`}
        </p>
        <p className="text-sm text-muted">Maßgeblich ist die extern abgelegte Kopie des Kopf-Hashs (täglicher Job, Benachrichtigung); die Datenbank allein ist kein Beweis gegen eine Änderung durch Administratoren.</p>
        <a className="btn btn-ghost !min-h-9 !px-3 text-sm" href={EXPORT_URL} download>Gesamtketten-Export (NDJSON)</a>
      </div>

      {rows.length === 0 ? (
        <p className="card text-muted" data-testid="no-evidence">Noch keine Einträge.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.matchId} className="card flex flex-wrap items-center justify-between gap-2" data-testid="evidence-match">
              <span>
                <span className="font-semibold">Spiel {r.number ?? "ohne Nummer"}</span> · {r.entries} Einträge
                <span className="block text-sm text-muted">zuletzt {formatDateTime(r.lastAt)}</span>
              </span>
              <a className="btn btn-ghost !min-h-9 !px-3 text-sm" href={`/api/beweis/${r.matchId}`}>PDF</a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
