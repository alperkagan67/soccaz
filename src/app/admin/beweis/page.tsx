import type { Metadata } from "next";
import { formatDateTime } from "@/lib/time";
import { cachedEvidenceReport } from "@/server/evidence";
import { listEvidenceMatches } from "@/server/evidence-export";
import { getEvidenceSwitchState } from "@/server/evidence-admin";
import { switchEvidenceAction } from "@/server/evidence-admin-actions";
import { requirePermission } from "@/server/session";
import { EvidenceSwitchForm } from "./EvidenceSwitchForm";

export const metadata: Metadata = { title: "Admin: Beweisprotokoll" };

const EXPORT_URL = "/api/beweis/kette"; // Dateidownload (Route-Handler), kein Seitenwechsel: darum kein Link-Element

/**
 * Beweisprotokoll (Vertrag 009 M3c, ENTWURF ohne Lauf): Stand der Gesamtkette (Anzahl, Kopf-Hash, Prüfergebnis, verwaiste Verweise, fehlende Einträge), Gesamtketten-Export und die Spiele mit Einträgen
 * mit PDF-Abruf. Nur Admin 1. Admin-Seite degradiert bis 013 M7 (wie M2); der Kopf-Hash steht in JEDEM Abruf (Plan Q1a, Variante G).
 */
export default async function EvidencePage() {
  await requirePermission("owner", "/admin/beweis");
  const report = await cachedEvidenceReport(); // höchstens alle 60 s neu berechnet (Prüfstand mit Zeitpunkt)
  const rows = await listEvidenceMatches();
  const sw = await getEvidenceSwitchState();
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
        <p className="text-sm text-muted" data-testid="evidence-checked-at">Prüfstand vom {formatDateTime(report.checkedAt)} (wird höchstens einmal pro Minute neu berechnet; der Tagesjob rechnet immer frisch).</p>
        <p className="text-sm text-muted">Maßgeblich ist die extern abgelegte Kopie des Kopf-Hashs (täglicher Job, Benachrichtigung); die Datenbank allein ist kein Beweis gegen eine Änderung durch Administratoren.</p>
        <a className="btn btn-ghost !min-h-9 !px-3 text-sm" href={EXPORT_URL} download>Gesamtketten-Export (NDJSON)</a>
      </div>

      <div className="card space-y-3" data-testid="evidence-switch">
        <h2 className="text-lg font-semibold">Beweispflicht</h2>
        <p data-testid="evidence-switch-state">
          Uhrenquelle: <strong>{sw.clockDb ? "Datenbank" : "Anwendung (noch nicht umgestellt)"}</strong> · Beweispflicht: <strong>{sw.enforcementOn ? "eingeschaltet" : "ausgeschaltet"}</strong>
          {sw.changedAt ? <span className="text-sm text-muted"> · letzte Änderung {formatDateTime(sw.changedAt)}</span> : null}
        </p>
        {!sw.clockDb && (
          <div data-testid="switch-clock" className="space-y-2">
            <p className="text-sm text-muted">Schritt 1: Erst wenn die Anwendung Fristen mit der Datenbankzeit prüft, darf die Uhrenquelle umgestellt werden.</p>
            <EvidenceSwitchForm action={switchEvidenceAction.bind(null, "clock_db")} step="clock_db" label="Uhrenquelle auf Datenbank stellen" />
          </div>
        )}
        {sw.clockDb && !sw.enforcementOn && (
          <div data-testid="switch-enforcement" className="space-y-2">
            <p className="text-sm text-muted">Schritt 2: Danach lehnt die Datenbank Ablehnungen ohne Grund und Antworten nach der Frist ab. Ausschalten geht nur als Wartungsfall.</p>
            <EvidenceSwitchForm action={switchEvidenceAction.bind(null, "enforcement_on")} step="enforcement_on" label="Beweispflicht einschalten" />
          </div>
        )}
        {sw.clockDb && sw.enforcementOn && (
          <p className="text-sm text-muted" data-testid="switch-done">
            Die Beweispflicht ist eingeschaltet.
          </p>
        )}
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
